from datetime import datetime
from typing import Optional, Dict, Any, List
from core.config import settings
import re

def filter_thinking_content(content: str) -> str:
    """Filter out thinking content enclosed in <think> tags from AI responses."""
    if not content or not isinstance(content, str):
        return content
    
    # Remove content between <think> and </think> tags (case insensitive, multiline)
    thinking_regex = r'<think\s*>[\s\S]*?</think\s*>'
    filtered_content = re.sub(thinking_regex, '', content, flags=re.IGNORECASE)
    
    # Clean up any extra whitespace or newlines left behind
    filtered_content = re.sub(r'\n\s*\n\s*\n', '\n\n', filtered_content).strip()
    
    return filtered_content

class PersistentContextManager:
    """
    Manages persistent candidate context that is ALWAYS present in AI prompts.
    No token limits - includes complete resume and job description.
    """
    
    def __init__(self):
        self.persistent_context = {
            'candidate_name': '',
            'target_company': '',
            'target_role': '',
            'complete_resume': '',        # UNLIMITED - Full resume
            'complete_job_description': '',  # UNLIMITED - Full job description
            'custom_instructions': '',    # User custom instructions on how AI should answer
            'focus_areas': [],
            'enable_reasoning': True,
            'reasoning_effort': 'medium',
            'enable_web_search': False,
            'additional_context': {},
            'created_at': None
        }
        self.conversation_history = []  # Limited to MAX_CONVERSATION_HISTORY exchanges
        self.is_initialized = False
    
    def initialize_persistent_context(self, onboarding_data: dict):
        """Initialize persistent context from onboarding data - called once per interview"""
        self.persistent_context.update({
            'candidate_name': onboarding_data.get('name', ''),
            'target_company': onboarding_data.get('company', ''),
            'target_role': onboarding_data.get('role', ''),
            'complete_resume': onboarding_data.get('resume', ''),  # FULL CONTENT
            'complete_job_description': onboarding_data.get('objectives', ''),  # FULL CONTENT
            'custom_instructions': onboarding_data.get('custom_instructions') or onboarding_data.get('instructions') or onboarding_data.get('customInstructions', ''),
            'focus_areas': onboarding_data.get('focus', []),
            'enable_reasoning': onboarding_data.get('enable_reasoning', onboarding_data.get('enableReasoning', True)),
            'reasoning_effort': onboarding_data.get('reasoning_effort', onboarding_data.get('reasoningEffort', 'medium')),
            'enable_web_search': onboarding_data.get('enable_web_search', onboarding_data.get('enableWebSearch', False)),
            'created_at': datetime.now().isoformat()
        })
        self.is_initialized = True
        custom_inst_len = len(self.persistent_context['custom_instructions'])
        print(f"✅ Persistent context initialized with full resume ({len(self.persistent_context['complete_resume'])} chars), custom instructions ({custom_inst_len} chars)")

    def update_settings(self, enable_reasoning: Optional[bool] = None, reasoning_effort: Optional[str] = None, enable_web_search: Optional[bool] = None, custom_instructions: Optional[str] = None):
        """Dynamically update context settings during an active interview session"""
        if enable_reasoning is not None:
            self.persistent_context['enable_reasoning'] = enable_reasoning
        if reasoning_effort is not None:
            self.persistent_context['reasoning_effort'] = reasoning_effort
        if enable_web_search is not None:
            self.persistent_context['enable_web_search'] = enable_web_search
        if custom_instructions is not None:
            self.persistent_context['custom_instructions'] = custom_instructions
        print(f"⚙️ Persistent context settings updated: reasoning={self.persistent_context['enable_reasoning']} ({self.persistent_context['reasoning_effort']}), search={self.persistent_context['enable_web_search']}")
    
    def add_conversation_exchange(self, interviewer_question: str, candidate_response: str = None, ai_response: str = None):
        """Add conversation exchange - limited to MAX_CONVERSATION_HISTORY most recent"""
        
        # Filter thinking content from AI response
        filtered_ai_response = filter_thinking_content(ai_response) if ai_response else ai_response
        
        exchange = {
            'interviewer_question': interviewer_question,
            'candidate_response': candidate_response,
            'ai_response': filtered_ai_response,
            'timestamp': datetime.now().isoformat()
        }
        
        # If we are only getting a candidate response, add it to the last exchange.
        if interviewer_question is None and candidate_response and self.conversation_history:
            self.conversation_history[-1]['candidate_response'] = candidate_response
        # If we are only getting an AI response, add it to the last exchange.
        elif interviewer_question is None and ai_response and self.conversation_history:
            self.conversation_history[-1]['ai_response'] = filtered_ai_response
        else:
            self.conversation_history.append(exchange)

        # Keep only last MAX_CONVERSATION_HISTORY exchanges
        max_history = settings.MAX_CONVERSATION_HISTORY
        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]
    
    def add_ai_response(self, ai_response: str, response_type: str = "normal"):
        """Add AI response to conversation history"""
        # Prefix vision analysis responses to distinguish them
        if response_type == "vision":
            ai_response = f"[VISION ANALYSIS] {ai_response}"
        
        # Filter out thinking content
        filtered_ai_response = filter_thinking_content(ai_response)
        
        # Add to the last exchange if it exists, otherwise create a new one
        if self.conversation_history:
            self.conversation_history[-1]['ai_response'] = filtered_ai_response
        else:
            # Create a new exchange with just the AI response
            exchange = {
                'interviewer_question': None,
                'candidate_response': None,
                'ai_response': filtered_ai_response,
                'timestamp': datetime.now().isoformat()
            }
            self.conversation_history.append(exchange)
        
        # Keep only last MAX_CONVERSATION_HISTORY exchanges
        max_history = settings.MAX_CONVERSATION_HISTORY
        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]
        
        print(f"✅ AI response added to conversation history (type: {response_type}, total exchanges: {len(self.conversation_history)})")
    
    def get_complete_context(self) -> dict:
        """Return complete context - persistent + conversation history"""
        return {
            'persistent': self.persistent_context,
            'conversation_history': self.conversation_history,
            'context_stats': {
                'resume_length': len(self.persistent_context['complete_resume']),
                'job_desc_length': len(self.persistent_context['complete_job_description']),
                'conversation_exchanges': len(self.conversation_history),
                'is_initialized': self.is_initialized
            }
        }
    
    def ensure_context_available(self) -> bool:
        """Verify persistent context is properly initialized"""
        return self.is_initialized and bool(self.persistent_context.get('candidate_name'))

    def reset_conversation_history(self):
        """Resets the conversation history."""
        self.conversation_history = []
        print("🔄 Conversation history reset")