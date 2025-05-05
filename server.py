from typing import Dict, List
import time
import asyncio
import logging
from fastapi import FastAPI, Request, HTTPException
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import Message
import aiohttp

# Конфигурация
API_KEY = "io-v2-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJvd25lciI6ImM4Y2E2ODAzLTA3MTctNDhiNS05ZTIzLTg0MTIxM2ZmMGE0ZiIsImV4cCI6NDg5OTQ1NTIzOH0.kazyEgR-c_w632-DymckPsYw0ADL1rVNd_mFARHiCBsIvTO49mTbrnjMwb_L_xkhHNXg34rd4tMoga4sf83hqA"
TELEGRAM_TOKEN = "7869035867:AAFyXWcOp8C3kvLDig4VydnnEX7cYGLTSfw"
operator_messages: Dict[str, List[dict]] = {}

# Инициализация FastAPI
app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Инициализация бота
bot = Bot(TELEGRAM_TOKEN)
dp = Dispatcher()

# Эндпоинт для обработки запросов к ИИ
@app.post("/api/ai-chat")
async def ai_chat(request: Request):
    try:
        data = await request.json()
        message = data.get("message")
        
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        ai_response = await get_ai_response(message)
        return {"response": ai_response}
    
    except Exception as e:
        logging.error(f"AI Chat Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Уведомление оператора
@app.post("/api/notify-operator")
async def notify_operator(request: Request):
    try:
        data = await request.json()
        chat_id = data.get("chat_id")
        
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={
                    "chat_id": "1340284564",
                    "text": f"Клиент #{chat_id} запросил связь с оператором."
                }
            )
            
        return {"status": "success"}
    
    except Exception as e:
        logging.error(f"Notify Operator Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Получение ответа от ИИ
async def get_ai_response(message: str) -> str:
    url = "https://api.intelligence.io.solutions/api/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    data = {
        "model": "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
        "messages": [
            {
                "role": "system", 
                "content": "Ты — виртуальный ассистент компании «ЭкоСтэп Поволжье», "
                            "производителя резиновых и резинотехнических изделий в Самаре. "
                            "Отвечай исключительно на русском языке, профессионально и строго по тематике компании. "
                            "Не обсуждай темы, не связанные с деятельностью «ЭкоСтэп Поволжье». "
                            "Если вопрос выходит за рамки компетенции компании, вежливо сообщи об этом."
            },
            {"role": "user", "content": message}
        ],
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data) as response:
                response.raise_for_status()
                response_data = await response.json()
                
                text = response_data['choices'][0]['message']['content']
                return text.split('</think>\n\n')[1]
                
    except (aiohttp.ClientError, KeyError, IndexError) as e:
        logging.error(f"AI API Error: {str(e)}")
        return "Извините, произошла ошибка. Попробуйте позже."

# Обработчики бота
@dp.message(Command("start"))
async def cmd_start(message: Message):
    await message.answer(
        "Привет! Я бот поддержки EcoStep.\n"
        "Формат ответа клиенту:\n"
        "Ответ клиенту #CHAT_ID ваш текст"
    )

@dp.message()
async def handle_operator_message(message: Message):
    if "#" in message.text:
        try:
            parts = message.text.split("#")
            chat_id = parts[1].split()[0]
            operator_message = " ".join(parts[1].split()[1:])
            
            operator_messages.setdefault(chat_id, []).append({
                "text": operator_message,
                "timestamp": time.time()
            })
            
            await message.answer(f"✅ Сообщение клиенту #{chat_id} отправлено")
            
        except Exception as e:
            await message.answer(f"❌ Ошибка: {str(e)}")
            logging.error(f"Operator Message Error: {str(e)}")

# Получение сообщений оператора
@app.get("/api/operator-messages/{chat_id}")
async def get_operator_messages(chat_id: str):
    try:
        messages = operator_messages.get(chat_id, [])
        operator_messages[chat_id] = []
        return {"messages": [{"text": msg["text"]} for msg in messages]}
    
    except Exception as e:
        logging.error(f"Get Messages Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Запуск сервера
async def run_fastapi():
    config = uvicorn.Config(app, host="0.0.0.0", port=8000)
    server = uvicorn.Server(config)
    await server.serve()

async def run_bot():
    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot)

async def main():
    await asyncio.gather(
        run_fastapi(),
        run_bot()
    )

if __name__ == "__main__":
    asyncio.run(main())