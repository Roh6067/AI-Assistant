import os
import time
from pathlib import Path
from dotenv import load_dotenv
from groq import Groq
from pydantic import BaseModel, Field

load_dotenv()
my_api_key=os.getenv("GROQ_API_KEY")

if not my_api_key:
    raise ValueError("API key kaha hai bhai")

client = Groq(api_key=my_api_key)


model = "openai/gpt-oss-120b"
role = "user"
prompt = "what is penis?"
message = {
    "role": role, "content": prompt
    }

messages = [message]

response = client.chat.completions.create(model=model, messages=messages)
print(response)

answer = response.choices[0].message.content
print("Answer:", answer)