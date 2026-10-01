export const dailyLimits=Object.freeze({questions:100,voice:12,analyses:10,memory:12});
export function usageView(state,now=new Date()){
 const day=now.toISOString().slice(0,10),usage=state.usage?.day===day?state.usage:{day,questions:0,voice:0,analyses:0,ids:[]};
 return {day,questions:usage.questions,voice:usage.voice,analyses:usage.analyses,memory:usage.memory||0,limits:dailyLimits,scope:'Local service, all workspaces',reset:'00:00 UTC',billing:'Request counts, not a monetary spending limit or invoice.'};
}
export function reserveUsage(state,kind,id,now=new Date()){
 if(!Object.hasOwn(dailyLimits,kind))throw new Error('Unknown usage category.');
 const view=usageView(state,now);
 if(state.usage?.day!==view.day)state.usage={day:view.day,questions:0,voice:0,analyses:0,ids:[]};
 const usage=state.usage,key=kind+':'+id;usage[kind]||=0;
 if(usage.ids.includes(key))return view;
 if(usage[kind]>=dailyLimits[kind])throw Object.assign(new Error(`The local daily ${kind} limit (${dailyLimits[kind]}) has been reached. It resets at 00:00 UTC. Your saved chats remain available.`),{status:429});
 usage[kind]++;usage.ids.push(key);return usageView(state,now);
}
