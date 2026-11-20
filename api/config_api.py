import orjson
import aiofiles
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.config import settings
from core.key_utils import resolve_provider_keys
import window_manager
from services.llm_service import verify_provider_connection
from services.vision_service import verify_vision_provider_connection
from core.env_utils import env_manager
import shutil
import os

router = APIRouter()

class TransparencyRequest(BaseModel):
    transparency: float  # 0.0 to 1.0

class TransparencyPercentRequest(BaseModel):
    percent: int  # 0 to 100

class ProviderVerifyRequest(BaseModel):
    name: str
    model: Optional[str] = None
    apiKey: Optional[str] = None
    apiKeys: Optional[list] = None

class SaveProvidersRequest(BaseModel):
    providers: list

class SaveKeyRequest(BaseModel):
    key: str

PROFILE_FILE = "user_profile.json"

@router.get("/api/profile")
async def get_user_profile():
    """
    Returns saved user profile data (onboarding info, AI preferences, etc.)
    if it exists, or empty object.
    """
    try:
        if os.path.exists(PROFILE_FILE):
            async with aiofiles.open(PROFILE_FILE, "rb") as f:
                content = await f.read()
                return orjson.loads(content)
        return {}
    except Exception as e:
        print(f"⚠️ Error reading user profile: {e}")
        return {}

@router.post("/api/profile")
async def save_user_profile(profile_data: Dict[str, Any]):
    """
    Saves user profile data (onboarding info, AI preferences, etc.)
    to user_profile.json.
    """
    try:
        async with aiofiles.open(PROFILE_FILE, "wb") as f:
            await f.write(orjson.dumps(profile_data, option=orjson.OPT_INDENT_2))
        return {"success": True, "message": "Profile saved successfully"}
    except Exception as e:
        print(f"❌ Error saving user profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {e}")

@router.get("/api/config")
async def get_config():
    """
    Returns frontend configuration values including DEV_MODE.
    This allows JavaScript to access centralized config values.
    """
    return {
        "DEV_MODE": settings.DEV_MODE,
        "LOG_LEVEL": settings.LOG_LEVEL,
        "CAPTURE_PROTECTION_ENABLED": not settings.DEV_MODE
    }

@router.get("/api/ai-providers")
async def get_ai_providers():
    """
    Reads the ai_providers.json file and returns a list of providers
    to the frontend, excluding sensitive API keys.
    """
    try:
        if not os.path.exists("ai_providers.json"):
            if os.path.exists("ai_providers.example.json"):
                print("📝 ai_providers.json not found, creating from example...")
                shutil.copy("ai_providers.example.json", "ai_providers.json")
            else:
                raise HTTPException(status_code=404, detail="ai_providers.json and example not found")

        async with aiofiles.open("ai_providers.json", "rb") as f:
            file_content = await f.read()
            providers = orjson.loads(file_content)
        
        # Sanitize the data before sending to the client
        client_safe_providers = [
            {
                "name": p.get("name"),
                "models": p.get("models", []),
                "visionModels": p.get("visionModels", []),
                "supportsVision": p.get("supportsVision", False),
                "hasKey": bool(resolve_provider_keys(p)),
                # Images this provider accepts in a single request. The
                # screenshot queue caps itself to this so a batch is never
                # assembled that the selected vision model will reject.
                "maxImages": p.get("maxImages"),
                "defaultPrimary": p.get("defaultPrimary", False),
                "defaultSecondary": p.get("defaultSecondary", False),
                "defaultVisionPrimary": p.get("defaultVisionPrimary", False),
                "defaultVisionSecondary": p.get("defaultVisionSecondary", False),
                "defaultModel": p.get("defaultModel"),
                "defaultVisionModel": p.get("defaultVisionModel"),
                # Keep legacy default for backward compatibility
                "default": p.get("defaultPrimary", False)
            }
            for p in providers
        ]
        return client_safe_providers
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="ai_providers.json not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading provider config: {e}")

@router.get("/api/ai-providers/full")
async def get_ai_providers_full():
    """
    Returns the full ai_providers.json INCLUDING API keys.
    Used for the advanced configuration UI.
    """
    try:
        if not os.path.exists("ai_providers.json"):
             if os.path.exists("ai_providers.example.json"):
                shutil.copy("ai_providers.example.json", "ai_providers.json")
             else:
                return []
                
        async with aiofiles.open("ai_providers.json", "rb") as f:
            file_content = await f.read()
            return orjson.loads(file_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading full provider config: {e}")

@router.post("/api/save-ai-providers")
async def save_ai_providers(request: SaveProvidersRequest):
    """Saves the full provider configuration to ai_providers.json."""
    try:
        async with aiofiles.open("ai_providers.json", "wb") as f:
            await f.write(orjson.dumps(request.providers, option=orjson.OPT_INDENT_2))
        return {"success": True, "message": "AI Providers saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving provider config: {e}")

@router.get("/api/deepgram-key")
async def get_deepgram_key():
    """Retrieves the current DEEPGRAM_API_KEY from .env."""
    key = env_manager.get_value("DEEPGRAM_API_KEY")
    return {"key": key or ""}

@router.post("/api/save-deepgram-key")
async def save_deepgram_key(request: SaveKeyRequest):
    """Updates the DEEPGRAM_API_KEY in the .env file."""
    try:
        success = env_manager.update_key("DEEPGRAM_API_KEY", request.key)
        if success:
            return {"success": True, "message": "Deepgram API key saved successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to update .env file")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving Deepgram key: {e}")

@router.post("/api/verify-provider")
async def verify_ai_provider(request: ProviderVerifyRequest):
    """
    Verifies a connection to the selected AI provider.
    Supports keys passed directly in the request or from ai_providers.json.
    Automatically saves working keys to ai_providers.json.
    """
    try:
        async with aiofiles.open("ai_providers.json", "rb") as f:
            file_content = await f.read()
            providers = orjson.loads(file_content)
        
        provider_config = next((p for p in providers if p["name"] == request.name), None)

        if not provider_config:
            raise HTTPException(status_code=404, detail=f"Provider '{request.name}' not found.")

        # Prioritize key(s) sent directly in request
        from core.key_utils import usable_keys, is_placeholder_key
        api_keys = []
        if request.apiKeys:
            api_keys.extend(usable_keys(request.apiKeys))
        if request.apiKey and not is_placeholder_key(request.apiKey):
            api_keys.append(request.apiKey.strip())
        
        # Fallback to configured keys on disk
        if not api_keys:
            api_keys = resolve_provider_keys(provider_config)

        if not api_keys:
            print(f"⚠️ No usable API key configured for {request.name}")
            return {"success": False, "error": "No API key provided. Please enter your API key first."}

        last_error = "Verification failed."
        test_model = request.model or provider_config.get("defaultModel") or "gemini-3.8-flash"

        # Try each key until one works
        for i, key in enumerate(api_keys):
            is_valid, msg = await verify_provider_connection(
                base_url=provider_config.get("baseURL"),
                api_key=key,
                model_name=test_model
            )
            if is_valid:
                # Auto-save working key into ai_providers.json
                try:
                    provider_config["apiKey"] = key
                    real_keys = [k for k in api_keys if not is_placeholder_key(k)]
                    provider_config["apiKeys"] = real_keys if real_keys else [key]
                    async with aiofiles.open("ai_providers.json", "wb") as f_out:
                        await f_out.write(orjson.dumps(providers, option=orjson.OPT_INDENT_2))
                    print(f"💾 Auto-saved verified key for {request.name} to ai_providers.json")
                except Exception as save_err:
                    print(f"⚠️ Auto-save failed: {save_err}")
                return {"success": True, "message": "Connection verified and key saved!"}
            else:
                last_error = msg
                print(f"⚠️ Key {i+1}/{len(api_keys)} failed for {request.name}: {msg}")
        
        return {"success": False, "error": last_error}

    except Exception as e:
        print(f"❌ Failed to verify provider: {e}")
        return {"success": False, "error": str(e)}

@router.post("/api/verify-vision-provider")
async def verify_vision_ai_provider(request: ProviderVerifyRequest):
    """
    Verifies a connection to the selected vision AI provider.
    Tries all available apiKeys if the first one fails.
    """
    try:
        async with aiofiles.open("ai_providers.json", "rb") as f:
            file_content = await f.read()
            providers = orjson.loads(file_content)
        
        provider_config = next((p for p in providers if p["name"] == request.name), None)

        if not provider_config:
            raise HTTPException(status_code=404, detail=f"Provider '{request.name}' not found.")

        if not provider_config.get("supportsVision", False):
            raise HTTPException(status_code=400, detail=f"Provider '{request.name}' does not support vision.")

        # Check if model exists in visionModels and extract model config (handle both string and object formats)
        vision_models = provider_config.get("visionModels", [])
        model_config = None
        test_model = request.model or provider_config.get("defaultVisionModel") or "gemini-3.8-flash"
        
        for vision_model in vision_models:
            if isinstance(vision_model, str) and vision_model == test_model:
                model_config = {"modelName": vision_model}  # Normalize to dict
                break
            elif isinstance(vision_model, dict) and vision_model.get("modelName") == test_model:
                model_config = vision_model
                break
        
        if not model_config:
            model_config = {"modelName": test_model}

        # Prioritize key(s) sent directly in request
        from core.key_utils import usable_keys, is_placeholder_key
        api_keys = []
        if request.apiKeys:
            api_keys.extend(usable_keys(request.apiKeys))
        if request.apiKey and not is_placeholder_key(request.apiKey):
            api_keys.append(request.apiKey.strip())
        
        # Fallback to configured keys on disk
        if not api_keys:
            api_keys = resolve_provider_keys(provider_config)

        if not api_keys:
            print(f"⚠️ No usable vision API key configured for {request.name}")
            return {"success": False, "error": "No API key configured for this vision provider."}

        last_error = "Vision verification failed."
        # Try each key until one works
        for i, key in enumerate(api_keys):
            is_valid, msg = await verify_vision_provider_connection(
                base_url=provider_config.get("baseURL"),
                api_key=key,
                model_name=test_model,
                request_params=model_config.get("requestParams")
            )
            if is_valid:
                # Auto-save working key into ai_providers.json
                try:
                    provider_config["apiKey"] = key
                    real_keys = [k for k in api_keys if not is_placeholder_key(k)]
                    provider_config["apiKeys"] = real_keys if real_keys else [key]
                    async with aiofiles.open("ai_providers.json", "wb") as f_out:
                        await f_out.write(orjson.dumps(providers, option=orjson.OPT_INDENT_2))
                    print(f"💾 Auto-saved verified vision key for {request.name} to ai_providers.json")
                except Exception as save_err:
                    print(f"⚠️ Auto-save failed: {save_err}")
                return {"success": True, "message": "Vision connection verified and key saved!"}
            else:
                last_error = msg
                print(f"⚠️ Vision key {i+1}/{len(api_keys)} failed for {request.name}: {msg}")
        
        return {"success": False, "error": last_error}

    except Exception as e:
        print(f"❌ Failed to verify vision provider: {e}")
        return {"success": False, "error": str(e)}

@router.get("/api/transparency")
async def get_transparency():
    """Get current window transparency information"""
    return window_manager.get_transparency_info()

@router.post("/api/transparency")
async def set_transparency(request: TransparencyRequest):
    """Set window transparency (0.0 = transparent, 1.0 = opaque)"""
    success = window_manager.set_app_transparency(request.transparency)
    if success:
        return {
            "success": True,
            "transparency": request.transparency,
            "message": f"Transparency set to {request.transparency*100:.0f}%"
        }
    else:
        raise HTTPException(status_code=400, detail="Failed to set transparency")

@router.post("/api/transparency/percent")
async def set_transparency_percent(request: TransparencyPercentRequest):
    """Set window transparency as percentage (0 = transparent, 100 = opaque)"""
    success = window_manager.set_app_transparency_percent(request.percent)
    if success:
        return {
            "success": True,
            "percent": request.percent,
            "transparency": request.percent / 100.0,
            "message": f"Transparency set to {request.percent}%"
        }
    else:
        raise HTTPException(status_code=400, detail="Failed to set transparency")

@router.post("/api/transparency/presets/transparent")
async def make_transparent():
    """Make window 60% transparent (40% opacity) - good for interviews"""
    success = window_manager.make_app_transparent()
    if success:
        return {"success": True, "message": "Window set to interview mode (40% opacity)"}
    else:
        raise HTTPException(status_code=400, detail="Failed to set transparency")

@router.post("/api/transparency/presets/semi-transparent")
async def make_semi_transparent():
    """Make window semi-transparent (70% opacity)"""
    success = window_manager.make_app_semi_transparent()
    if success:
        return {"success": True, "message": "Window set to semi-transparent (70% opacity)"}
    else:
        raise HTTPException(status_code=400, detail="Failed to set transparency")

@router.post("/api/transparency/presets/opaque")
async def make_opaque():
    """Make window fully opaque (100% opacity)"""
    success = window_manager.make_app_opaque()
    if success:
        return {"success": True, "message": "Window set to opaque (100% opacity)"}
    else:
        raise HTTPException(status_code=400, detail="Failed to set transparency")

@router.get("/api/capture-protection")
async def get_capture_protection():
    """Get current capture protection status (True = hidden from screen capture)."""
    return {"enabled": window_manager.get_capture_protection_status()}

@router.post("/api/capture-protection/toggle")
async def toggle_capture_protection():
    """Toggle screen capture protection between stealth and visible-to-capture."""
    success = window_manager.toggle_capture_protection()
    enabled = window_manager.get_capture_protection_status()
    return {"success": success, "enabled": enabled}

