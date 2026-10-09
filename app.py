"""顶级健身教练 · 后端（FastAPI）
通过 OCI Generative AI 调用 xai.grok-4.7（凭据只在服务器端读取 ~/.oci/config）。
运行:  python app.py   （默认 http://127.0.0.1:8765）
环境变量: OCI_PROFILE, OCI_CONFIG_FILE, OCI_COMPARTMENT_ID, OCI_REGION, GROK_MODEL, HOST, PORT
"""
import json, os, threading, queue
from pathlib import Path

import oci
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from prompts import SYSTEM_PROMPT, profile_to_text

BASE = Path(__file__).parent
MODEL = os.environ.get("GROK_MODEL", "xai.grok-4.7")
PROFILE = os.environ.get("OCI_PROFILE", "DEFAULT")
CONFIG_FILE = os.environ.get("OCI_CONFIG_FILE", oci.config.DEFAULT_LOCATION)

_cfg = oci.config.from_file(file_location=CONFIG_FILE, profile_name=PROFILE)
REGION = os.environ.get("OCI_REGION", _cfg.get("region") or "us-chicago-1")
COMPARTMENT = os.environ.get("OCI_COMPARTMENT_ID", _cfg["tenancy"])
_client = oci.generative_ai_inference.GenerativeAiInferenceClient(
    _cfg, service_endpoint=f"https://inference.generativeai.{REGION}.oci.oraclecloud.com",
    timeout=(10, 600))
M = oci.generative_ai_inference.models

MAX_TURNS = 30  # 发送给模型的最近消息条数上限

app = FastAPI(title="Grok 健身教练")


def _msg(role, text):
    cls = {"system": M.SystemMessage, "user": M.UserMessage, "assistant": M.AssistantMessage}[role]
    return cls(content=[M.TextContent(text=text)])


def build_messages(history, profile):
    sys = SYSTEM_PROMPT
    ptxt = profile_to_text(profile or {})
    if ptxt:
        sys += "\n\n## 当前学员档案（用户在界面填写，回答时直接使用，不要重复索要已提供的信息）\n" + ptxt
    msgs = [_msg("system", sys)]
    clean = [h for h in history if h.get("role") in ("user", "assistant") and str(h.get("content", "")).strip()]
    for h in clean[-MAX_TURNS:]:
        msgs.append(_msg(h["role"], str(h["content"])[:20000]))
    return msgs


@app.get("/api/health")
def health():
    return {"ok": True, "model": MODEL, "region": REGION}


@app.post("/api/chat")
async def chat(req: Request):
    body = await req.json()
    history = body.get("messages") or []
    profile = body.get("profile") or {}
    if not history or history[-1].get("role") != "user":
        return JSONResponse({"error": "最后一条消息必须是用户消息"}, status_code=400)

    chat_req = M.GenericChatRequest(messages=build_messages(history, profile),
                                    max_tokens=8000, temperature=0.6, is_stream=True)
    details = M.ChatDetails(compartment_id=COMPARTMENT,
                            serving_mode=M.OnDemandServingMode(model_id=MODEL),
                            chat_request=chat_req)
    q: "queue.Queue[tuple[str, str] | None]" = queue.Queue()

    def worker():
        try:
            resp = _client.chat(details)
            for ev in resp.data.events():
                try:
                    d = json.loads(ev.data)
                except Exception:
                    continue
                m = d.get("message") or {}
                if m.get("reasoningContent"):
                    q.put(("thinking", m["reasoningContent"]))
                for c in m.get("content") or []:
                    if c.get("text"):
                        q.put(("delta", c["text"]))
                if d.get("finishReason"):
                    q.put(("finish", d["finishReason"]))
        except oci.exceptions.ServiceError as e:
            q.put(("error", f"OCI 服务错误 {e.status}: {e.message}"))
        except Exception as e:  # noqa
            q.put(("error", f"{type(e).__name__}: {e}"))
        finally:
            q.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def gen():
        while True:
            item = q.get()
            if item is None:
                yield "event: done\ndata: {}\n\n"
                break
            kind, text = item
            yield f"event: {kind}\ndata: {json.dumps({'t': text}, ensure_ascii=False)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8765")))
