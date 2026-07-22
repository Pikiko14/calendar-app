export default () => ({
  port: Number(process.env.PORT ?? 3000),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'cambie-este-secreto-en-produccion',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  app: {
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    url: process.env.APP_URL ?? 'http://localhost:5173',
  },
  whatsapp: {
    enabled: (process.env.WHATSAPP_ENABLED ?? 'true').toLowerCase() !== 'false',
    sessionPath: process.env.WHATSAPP_SESSION_PATH ?? './bot_sessions',
    interactiveButtons:
      (process.env.WHATSAPP_INTERACTIVE ?? 'false').toLowerCase() === 'true',
    antiBan: {
      minGapMs: Number(process.env.WHATSAPP_MIN_GAP_MS ?? 1800),
      msPerChar: Number(process.env.WHATSAPP_MS_PER_CHAR ?? 12),
      typingMinMs: Number(process.env.WHATSAPP_TYPING_MIN_MS ?? 800),
      typingMaxMs: Number(process.env.WHATSAPP_TYPING_MAX_MS ?? 4500),
      maxPerMinuteTenant: Number(process.env.WHATSAPP_MAX_PER_MIN ?? 18),
      maxPerMinuteChat: Number(process.env.WHATSAPP_MAX_PER_CHAT_MIN ?? 8),
      inboundDebounceMs: Number(process.env.WHATSAPP_INBOUND_DEBOUNCE_MS ?? 900),
    },
  },
});
