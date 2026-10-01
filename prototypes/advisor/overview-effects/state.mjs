// Shared embedded advisor presentation. Existing voice transport states remain unchanged.
export function overviewOrbState({ active = false, state = 'idle', toolActive = false, working = false } = {}) {
 if (active && state === 'ending') return { orb: 'breathing', label: 'Stopping', paused: true };
 if (active && state === 'speaking') return { orb: 'composing', label: 'Speaking' };
 if (active && toolActive) return { orb: 'searching', label: 'Using tools' };
 if (working || (active && state === 'working')) return { orb: 'solving', label: 'Working' };
 if (active && state === 'connecting') return { orb: 'breathing', label: 'Connecting', paused: true };
 if (active) return { orb: 'breathing', label: 'Listening' };
 return null;
}

export function isAdvisorPage(page) {
 return typeof page === 'string' && /^#\/?[a-z][a-z0-9-]*(?:[/?]|$)/.test(page);
}
