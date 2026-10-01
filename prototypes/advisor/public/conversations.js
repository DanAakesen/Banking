// Synthetic Demo history only. The renderer cannot access this host-owned storage.
export function conversationStore(storage, key = 'banking.advisor.chats.v1') {
 let state;
 try { state = JSON.parse(storage.getItem(key)); } catch {}
 if (!state || !Array.isArray(state.chats)) state = { chats: [], activeId: null };
 for (const chat of state.chats) { const first = chat.messages.find(x => x.role === 'user'); if (first) chat.title = first.text.trim().slice(0, 70); }
 const persist = () => storage.setItem(key, JSON.stringify(state));
 const current = () => state.chats.find(x => x.id === state.activeId);
 return {
  get chats() { return state.chats; }, current,
  create() { const chat = { id: crypto.randomUUID(), title: 'New conversation', messages: [], artifact: null, draft: '', updatedAt: new Date().toISOString() }; state.chats.push(chat); state.activeId = chat.id; persist(); return chat; },
  select(id) { if (!state.chats.some(x => x.id === id)) return false; state.activeId = id; persist(); return true; },
  update(patch) { Object.assign(current(), patch, { updatedAt: new Date().toISOString() }); persist(); },
  message(role, content, extra = {}) { const chat = current(); const entry = { id: crypto.randomUUID(), role, text: content, at: new Date().toISOString(), ...extra }; chat.messages.push(entry); if (chat.title === 'New conversation' && role === 'user') chat.title = content.slice(0, 70); chat.updatedAt = entry.at; persist(); return entry; },
  voice(messages) { const chat = current(); chat.messages = [...chat.messages.filter(x => !x.voice), ...messages.map(x => ({ ...x, voice: true }))]; chat.updatedAt = new Date().toISOString(); if (chat.title === 'New conversation') chat.title = messages.find(x => x.role === 'user')?.text.slice(0, 70) || chat.title; persist(); },
  context() { return (current()?.messages || []).filter(x => !x.error).slice(-16).map(({ role, text }) => ({ role, text: text.slice(0, 2000) })); }
 };
}
