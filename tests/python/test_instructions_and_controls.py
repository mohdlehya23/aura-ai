import unittest
from unittest.mock import MagicMock, AsyncMock, patch
from services.context_manager import PersistentContextManager
from core.prompts import get_interview_answer_prompt, get_quick_response_prompt
from services.llm_service import LLMManager, MultiLLMManager

class TestInstructionsAndControls(unittest.TestCase):
    def setUp(self):
        self.ctx = PersistentContextManager()
        self.onboarding_data = {
            'name': 'Test Candidate',
            'company': 'TechCorp',
            'role': 'Software Engineer',
            'resume': 'Python, Algorithms, Systems',
            'objectives': 'Pass the interview',
            'focus': ['coding', 'dsa'],
            'custom_instructions': 'Answer concisely in bullet points under 2 minutes. Focus on practical examples.',
            'enable_reasoning': True,
            'reasoning_effort': 'medium',
            'enable_web_search': False
        }
        self.ctx.initialize_persistent_context(self.onboarding_data)

    def test_context_manager_stores_instructions_and_controls(self):
        persistent = self.ctx.get_complete_context()['persistent']
        self.assertEqual(persistent['custom_instructions'], 'Answer concisely in bullet points under 2 minutes. Focus on practical examples.')
        self.assertTrue(persistent['enable_reasoning'])
        self.assertEqual(persistent['reasoning_effort'], 'medium')
        self.assertFalse(persistent['enable_web_search'])

    def test_context_manager_dynamic_update_settings(self):
        self.ctx.update_settings(
            enable_reasoning=False,
            reasoning_effort='off',
            enable_web_search=True,
            custom_instructions='New instructions'
        )
        persistent = self.ctx.get_complete_context()['persistent']
        self.assertFalse(persistent['enable_reasoning'])
        self.assertEqual(persistent['reasoning_effort'], 'off')
        self.assertTrue(persistent['enable_web_search'])
        self.assertEqual(persistent['custom_instructions'], 'New instructions')

    def test_prompts_inject_custom_instructions(self):
        prompt = get_interview_answer_prompt("What is an array?", self.ctx)
        self.assertIn("CANDIDATE'S CUSTOM INSTRUCTIONS FOR AI", prompt)
        self.assertIn("Answer concisely in bullet points under 2 minutes", prompt)
        self.assertIn("REASONING MODE (MEDIUM)", prompt)
        self.assertIn("WEB SEARCH DISABLED", prompt)

    def test_prompts_reflect_reasoning_off_and_web_search_on(self):
        self.ctx.update_settings(enable_reasoning=False, reasoning_effort='off', enable_web_search=True)
        prompt = get_interview_answer_prompt("What is a hash table?", self.ctx)
        self.assertIn("FAST DIRECT MODE: Extended internal thinking is disabled", prompt)
        self.assertIn("WEB SEARCH GROUNDING: Web search is enabled", prompt)

    def test_quick_response_prompt_injects_custom_instructions(self):
        prompt = get_quick_response_prompt("Explain recursion.", self.ctx)
        self.assertIn("CUSTOM CANDIDATE INSTRUCTIONS FOR AI", prompt)
        self.assertIn("Answer concisely in bullet points under 2 minutes", prompt)

    def test_llm_manager_thinking_off_omits_reasoning_effort(self):
        manager = LLMManager(
            provider_name="Gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key="test-key",
            model_name="gemini-2.5-flash",
            reasoning_effort="off",
            enable_reasoning=False
        )
        self.assertFalse(manager.enable_reasoning)
        self.assertEqual(manager.reasoning_effort, "off")

    def test_llm_manager_thinking_on_keeps_reasoning_effort(self):
        manager = LLMManager(
            provider_name="Gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key="test-key",
            model_name="gemini-2.5-flash",
            reasoning_effort="high",
            enable_reasoning=True
        )
        self.assertTrue(manager.enable_reasoning)
        self.assertEqual(manager.reasoning_effort, "high")

    def test_multi_llm_manager_set_reasoning_and_web_search(self):
        multi = MultiLLMManager()
        multi.shared_context = self.ctx
        multi.set_reasoning_effort("off")
        self.assertFalse(multi.enable_reasoning)
        self.assertEqual(multi.reasoning_effort, "off")
        self.assertFalse(self.ctx.persistent_context['enable_reasoning'])

        multi.set_web_search(True)
        self.assertTrue(multi.enable_web_search)
        self.assertTrue(self.ctx.persistent_context['enable_web_search'])

        multi.set_custom_instructions("Be extremely concise.")
        self.assertEqual(self.ctx.persistent_context['custom_instructions'], "Be extremely concise.")

    def test_prompts_enforce_job_description_and_candidate_level(self):
        prompt = get_interview_answer_prompt("What is dynamic programming?", self.ctx)
        self.assertIn("COMPLETE JOB DESCRIPTION/REQUIREMENTS:", prompt)
        self.assertIn("Pass the interview", prompt)
        self.assertIn("MANDATORY CONTEXT ALIGNMENT:", prompt)
        self.assertIn("CALIBRATE TECHNICAL DEPTH:", prompt)

    def test_window_manager_hotkey_map_has_emergency_restart(self):
        import inspect
        import window_manager
        source = inspect.getsource(window_manager.WindowManager._start_hotkey_listener_thread)
        self.assertIn("'<alt>+<shift>+r': on_emergency_restart", source)
        self.assertIn("def on_emergency_restart():", source)

if __name__ == '__main__':
    unittest.main()

