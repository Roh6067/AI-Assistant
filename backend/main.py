from fastapi.responses import StreamingResponse
import json
import os
from pathlib import Path
from fastapi import UploadFile, File, HTTPException
from io import BytesIO
from uuid import uuid4
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel
from pypdf import PdfReader
from typing import Literal
load_dotenv()

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)

model = "openai/gpt-oss-120b"
app=FastAPI()

frontend_url = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        frontend_url,
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    session_id: str
    messages: list[ChatMessage]

class candidate_question(BaseModel):
    question: str

def ask_candidate(request: candidate_question, resume: "Resume"):

    system_prompt = f"""
You are an AI assistant representing a job candidate.

Below is everything you know about the candidate.

{resume.model_dump_json(indent=2)}

Rules:

1. Answer only using this information.

2. Never hallucinate.

3. If information is unavailable,
say

"I don't have that specific information available in my
   resume at the moment. I would be happy to provide more
   details if needed."

4. Be professional.

5. Answer as if HR is interviewing this candidate.
"""

    response = client.chat.completions.create(

        model=model,

        messages=[

            {
                "role":"system",
                "content":system_prompt
            },

            {
                "role":"user",
                "content":request.question
            }

        ]

    )

    return response.choices[0].message.content

#parse resume
def parse_resume(resume_text):
    system_prompt = f"""
    You are an expert resume parser.

    Extract information from the resume based on its meaning,
    not only based on exact section headings.

    Different resumes may use different headings.

    For example:
    - Experience
    - Professional Experience
    - Work History
    - Employment
    - Internships

    These may all contain relevant experience.

    Skills may also appear in the skills section, work experience,
    internships or projects.

    Return ONLY valid JSON matching this schema:

    {resume_schema}

    Important rules:

    1. Do not invent information.
    2. If a value is not available, return null.
    3. If a list has no information, return an empty list.
    4. Include internships inside experiences.
    5. Extract skills mentioned across the entire resume.
    """
    user_prompt = f"""
    Parse the following resume:

    {resume_text}
    """
    message_system={
        "role" : "system",
        "content" : system_prompt
    }
    message_user={
        "role" : "user",
        "content" : user_prompt
    }
    messages=[message_system, message_user]
    response_format={
        "type": "json_object"
    }
    response=client.chat.completions.create(model=model, messages=messages, response_format=response_format)
    raw_output = response.choices[0].message.content
    data = json.loads(raw_output)
    resume = Resume(**data)
    return resume

#pydantic class for resume schema
class Experience(BaseModel):
    company: str | None = None
    role: str | None = None
    duration: str | None = None
    description: str | None = None
    skills_used: list[str] = []

class Resume(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None

    total_experience_years: float | None = None

    skills: list[str] = []
    experiences: list[Experience] = []
    education: list[str] = []
    projects: list[str] = []
    certifications: list[str] = []
resume_schema = Resume.model_json_schema()

def read_pdf(file_path:Path):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text



@app.post("/chat")
def chat(request: ChatRequest):
    # 1. Read the candidate's resume
    resume = resume_sessions.get(request.session_id)

    if resume is None:
        raise HTTPException(
            status_code=400,
            detail="Resume session not found. Upload again."
        )

    # 3. Give the extracted resume to the AI as context
    system_prompt = f"""
You are HireMe AI, an AI assistant that answers questions
about a specific job candidate using their resume.

CANDIDATE RESUME INFORMATION:
{resume.model_dump_json(indent=2)}

STRICT RULES:
1. Answer questions using only the information in this resume.
2. Remember the previous messages in the conversation.
3. Use the resume information to answer follow-up questions.
4. Never invent skills, experience, projects, education, or achievements.
5. If the information is missing, say:
   I'm afraid, I can only provide information based on the
details available in my resume. I'd be happy to share any
additional information that's relevant to my experience
and qualifications."
6. When asked about the candidate, answer naturally in first person,
   as if the candidate is speaking in an interview.
7. If asked about unrelated topics, politely explain that you are
   designed to answer questions based on the candidate's resume.
"""

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        }
    ]

    # 4. Include the conversation history for follow-up questions
    messages.extend(
        message.model_dump()
        for message in request.messages
    )

    # 5. Stream the answer from Groq
    def generate():
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
            )

            for chunk in stream:
                if not chunk.choices:
                    continue

                content = chunk.choices[0].delta.content

                if content:
                    yield content

        except Exception:
            yield "\n\nSorry, an error occurred while generating the answer."

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# Temporary in-memory storage
resume_sessions = {}

@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):

    # Check PDF file
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed"
        )

    # Read uploaded file
    pdf_bytes = await file.read()

    # Maximum 5 MB
    if len(pdf_bytes) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="PDF must be smaller than 5 MB"
        )

    try:
        reader = PdfReader(BytesIO(pdf_bytes))

        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported")

        resume_text = "\n".join(
            page.extract_text() or ""
            for page in reader.pages
        )

        if not resume_text.strip():
            raise ValueError("No readable text found in PDF")

        # Existing Groq function
        resume = parse_resume(resume_text)

        # Create unique session
        session_id = str(uuid4())

        # Save parsed resume
        resume_sessions[session_id] = resume

        return {
            "message": "Resume uploaded successfully",
            "session_id": session_id,
            "candidate_name": resume.name
        }

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Unable to process PDF: {str(e)}"
        )

