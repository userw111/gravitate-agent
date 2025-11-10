# Telegram Bot Setup Guide

This guide will help you set up Telegram notifications for transcript linking assistance.

## Step 1: Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Start a chat with BotFather and send `/newbot`
3. Follow the prompts to:
   - Choose a name for your bot (e.g., "Gravitate Agent Helper")
   - Choose a username (must end in `bot`, e.g., `gravitate_helper_bot`)
4. BotFather will give you a **bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. **Save this token** - you'll need it for the `TELEGRAM_BOT_TOKEN` environment variable

## Step 2: Get Your Chat ID

1. **First, start a chat with your new bot:**
   - Open Telegram and search for your bot by username (the one you created, e.g., `@gravitate_helper_bot`)
   - Click "Start" or send any message like "Hello" to the bot
   - **Important:** You must send at least one message to the bot before getting your chat ID

2. **Get your chat ID:**
   - Open this URL in your browser (replace `YOUR_BOT_TOKEN` with your actual token from Step 1):
     ```
     https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
     ```
   - If you see `"result": []` (empty array), it means:
     - You haven't sent a message to the bot yet, OR
     - The updates were already retrieved (Telegram clears them after you fetch them)
   - **Solution:** Send another message to your bot (e.g., "test"), then refresh the URL
   
3. **Find your chat ID in the response:**
   - Look for a section that looks like this:
     ```json
     {
       "message": {
         "chat": {
           "id": 123456789,
           "first_name": "Your Name",
           "type": "private"
         }
       }
     }
     ```
   - The number after `"id":` is your **chat ID**
   - **Note:** For group chats, the ID will be negative (e.g., `-1001234567890`)

4. **Save this chat ID** - you'll need it for the `TELEGRAM_CHAT_ID` environment variable

**Alternative method (if getUpdates doesn't work):**
- Send a message to your bot
- Then use this URL (replace both placeholders):
  ```
  https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates?offset=-1&limit=1
  ```
- This gets the most recent update

## Step 3: Set Up Webhook (Optional but Recommended)

To receive replies from Telegram, you need to set up a webhook:

1. Get your webhook URL (should be `https://yourdomain.com/api/telegram/webhook`)
2. Set the webhook using this URL (replace placeholders):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://yourdomain.com/api/telegram/webhook
   ```
3. Verify the webhook is set:
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
   ```

## Step 4: Configure Environment Variables

Add these to your `.env` file (or your deployment environment):

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

**Important:** 
- Never commit these values to git
- Keep your bot token secret
- The chat ID can be a personal chat or a group chat

## Step 5: Test the Integration

1. Go to Settings → Fireflies AI Integration
2. Click "Test AI Linking" button
3. If Telegram is configured, you should receive a notification
4. Reply to the Telegram message with a client name or email to test the linking

## Troubleshooting

### Bot not receiving messages
- Make sure you've started a chat with the bot first
- Verify the chat ID is correct (use `/getUpdates` endpoint)
- Check that the bot token is correct

### Webhook not working
- Ensure your webhook URL is publicly accessible
- Check that HTTPS is enabled (Telegram requires HTTPS)
- Verify the webhook URL returns 200 OK
- Check server logs for errors

### Notifications not sending
- Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set correctly
- Check Convex logs for errors
- Ensure the bot hasn't been blocked or deleted

## How It Works

1. When a transcript can't be auto-linked or AI-linked, the system sends a Telegram notification
2. The notification includes transcript details and a manual link
3. You can reply to the message with:
   - A client name (e.g., "Best Cleaners Inc")
   - A client email (e.g., "info@acme.com")
   - "manual" to skip and handle manually
4. The system will attempt to link the transcript based on your reply
5. If successful, you'll get a confirmation message

