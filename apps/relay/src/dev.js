// `npm run dev` — start 와 같지만 TTL 1시간 (RELAY_TTL_HOURS 를 따로 지정하지 않은 경우).
process.env.RELAY_TTL_HOURS ||= '1';
const { main } = await import('./server.js');
await main();
