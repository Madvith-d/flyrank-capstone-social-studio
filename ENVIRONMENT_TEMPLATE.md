# Environment Template

This hosted project uses managed server-side secret settings. The platform intentionally prevents committing or directly writing `.env` and `.env.example` files. The safe template below is the exact equivalent configuration reference for a standalone run; values are placeholders only.

```dotenv
# Real Telegram publisher — keep real values in private environment settings only.
TELEGRAM_BOT_TOKEN=replace_with_botfather_token
TELEGRAM_CHAT_ID=replace_with_owned_chat_or_channel_id

# Adapter map. Telegram is the permitted real target; X and LinkedIn are local mocks by default.
PUBLISHER_X=mock_x
PUBLISHER_LINKEDIN=mock_linkedin
PUBLISHER_TELEGRAM=telegram
```

The project’s managed secret registration contains `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The credential test uses Telegram’s lightweight `getMe` endpoint only when a token is configured. No token, chat ID, or other secret appears in tracked source.
