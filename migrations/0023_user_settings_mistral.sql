-- First-class Mistral provider support.
--
-- Mistral exposes an OpenAI-compatible chat-completions API, so at the
-- dispatch layer it rides the existing OpenAI code path (a `mistral:`
-- model prefix routes to Provider::OpenAI → local::stream with the
-- Mistral base URL). It still needs its own credential + model columns
-- on user_settings, parallel to the openai_* / local_* columns, so the
-- key is not conflated with a different provider's.

ALTER TABLE user_settings ADD COLUMN mistral_api_key TEXT;
ALTER TABLE user_settings ADD COLUMN mistral_model   TEXT;
