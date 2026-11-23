import unittest
import json
import os

class TestMultiProfiles(unittest.TestCase):
    def setUp(self):
        self.profile_path = "user_profile.json"

    def test_user_profile_has_multi_profiles(self):
        """Verify user_profile.json contains both CS and Medicine profiles."""
        self.assertTrue(os.path.exists(self.profile_path), "user_profile.json must exist")
        with open(self.profile_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("activeProfileId", data)
        self.assertIn("profiles", data)
        profiles = data["profiles"]

        # Ensure both profiles are present
        self.assertIn("cs", profiles, "CS profile must be present in saved profiles")
        self.assertIn("medicine", profiles, "Medicine profile must be present in saved profiles")

        # Verify CS profile details
        cs_profile = profiles["cs"]
        self.assertIn("Computer Science", cs_profile["role"])
        self.assertIn("data structures", cs_profile["resume"].lower())
        self.assertIn("coding", cs_profile["focus"])
        self.assertIn("Python/C++", cs_profile["customInstructions"])

        # Verify Medicine profile details
        med_profile = profiles["medicine"]
        self.assertIn("Clinical Medicine", med_profile["role"])
        self.assertIn("biology", med_profile["resume"].lower())
        self.assertIn("behavioral", med_profile["focus"])
        self.assertIn("undergraduate candidate", med_profile["customInstructions"])

    def test_active_profile_backward_compatibility(self):
        """Verify top-level keys remain populated for backward compatibility."""
        with open(self.profile_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for required_key in ["name", "role", "resume", "focus", "objectives", "customInstructions"]:
            self.assertIn(required_key, data, f"Top-level key '{required_key}' must exist for backward compatibility")
            self.assertTrue(bool(data[required_key]), f"Top-level key '{required_key}' should not be empty")

if __name__ == '__main__':
    unittest.main()
