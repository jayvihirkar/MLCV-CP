# OpenRouter / Nemotron intake provider

The intake can use OpenRouter instead of Gemini for contextual question writing. Speech-to-text remains on its existing Gemini/browser path, and the Medical TrOCR/NLP worker is unchanged.

The verified free model identifier is `nvidia/nemotron-3-ultra-550b-a55b:free` (checked 26 October 2026). OpenRouter's model listing currently advertises no response_format/structured_outputs support for this endpoint. The adapter requests JSON through the system prompt and validates the response locally. It does not send unsupported schema parameters or accept malformed/truncated responses. The same full conversation context, answer validation, persisted questions, rule-controlled safety checks, and visible failure fallback apply to either provider.

## Fictional test cases only on the free endpoint

The model page explicitly says not to upload confidential or personal information and discloses session logging for security and NVIDIA product/service improvement. The application therefore blocks free-model inference unless the operator explicitly enables synthetic test mode. Use a dedicated test instance with fictional cases; do not enable that flag on the existing instance containing real patient conversations.

For that dedicated test instance, create a key at https://openrouter.ai/settings/keys and set these server environment variables (or ignored .env):

```dotenv
INTAKE_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
OPENROUTER_SYNTHETIC_TEST_MODE=true
```

Restart the API. On Vercel set the same variables in the test project's environment and redeploy. Never use a VITE_ prefix or commit the key. Test with the fictional dry-cough case and verify the next question, refresh restoration, denial handling, and clinician transcript. Mocked requests are covered in the app tests; live OpenRouter inference is still unverified pending a user-provided key.

To keep/use Gemini:

```dotenv
INTAKE_LLM_PROVIDER=gemini
```

Provider switching is explicit. The app does not automatically send existing patient conversations to a free endpoint after a Gemini quota error. For any non-free endpoint, independently check the selected provider's data handling and account settings before deploying with patient information.

## Current limits and references

Free is not unlimited. OpenRouter applies account-level free-model request caps and upstream capacity/rate limits. The pricing page lists 50 requests/day for the free plan; account-specific limits and remaining requests can be checked using GET /api/v1/key with the server-side key. No quota allowance has been verified for this user's account.

- Model/endpoint notice: https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free
- Limits: https://openrouter.ai/docs/api_reference/limits
- Pricing: https://openrouter.ai/pricing
- Model API metadata: https://openrouter.ai/api/v1/models
