# kagent-lab 9장 — `kagent init adk python labbyo` 가 만든 labbyo/agent.py 의 create_model() 을
# 이 함수로 바꾼다. v0.9.9 OpenAI template은 LiteLlm(model="openai/<이름>")과 OPENAI_API_KEY만
# 생성해 public OpenAI endpoint를 향하므로, 사내 LiteLLM gateway를 쓰려면 api_base를 명시해야 한다.
import os

from google.adk.models.lite_llm import LiteLlm


def create_model():
    return LiteLlm(
        model=f"openai/{os.environ['LITELLM_MODEL']}",
        api_base=os.environ["LITELLM_BASE_URL"],
        api_key=os.environ["LITELLM_API_KEY"],
    )
