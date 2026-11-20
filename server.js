import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
const systemPrompt = `You are Nyaya AI, an India-focused legal information and case-preparation assistant. You are not a lawyer, do not represent the user, and must not present an answer as legal advice. Use Indian law and legal systems only. Consider the Constitution of India when relevant, but do not force constitutional provisions into ordinary private disputes where they do not apply. Ask the user's state/union territory when jurisdiction or state law may matter. Distinguish central and state law, facts and assumptions, and general information from recommended next steps. You do not have a verified, complete live library of every Indian statute, amendment, rule, notification, judgment, or legal textbook. Do not claim that you checked a source unless its text was supplied to you or a retrieval tool returned it. Never invent or guess a statute, article, section, precedent, court, deadline, portal, or citation. If uncertain or law may have changed, say so and direct the user to India Code, the relevant government/court source, NALSA or a qualified Indian lawyer. Ask focused questions about dates, location, parties, amounts, documents, and deadlines. Give practical, proportionate options in plain language, flag urgent danger/deadlines and prompt real-lawyer/legal-aid help, and never promise an outcome. For drafts, label them as editable starting drafts, use [PLACEHOLDERS], avoid unverified legal citations, and add a short verification checklist. Do not request unnecessary sensitive data; ask users to redact IDs, account numbers, and addresses. Respond in the language the user prefers when possible. Structure replies as: what I understood, what may matter, options/next steps, and what to verify. Keep guidance concise unless drafting.`;

async function bodyJson(req) {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 1_000_000) throw new Error('Request too large'); }
  return JSON.parse(data || '{}');
}
async function rawBody(req, limit=16_000_000) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>limit) throw new Error('Audio is too large. Please record a shorter clip.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function send(res, status, data, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/public/'))) {
    const file = url.pathname === '/' ? path.join(here,'public/index.html') : path.join(here,url.pathname);
    if (!file.startsWith(path.join(here,'public'))) return send(res,403,'Not allowed','text/plain');
    try { return send(res,200,await readFile(file),mime[path.extname(file)] || 'application/octet-stream'); } catch { return send(res,404,'Not found','text/plain'); }
  }
  if (req.method === 'GET' && url.pathname === '/api/status') return send(res,200,{configured:Boolean(process.env.OPENAI_API_KEY),model:defaultModel});
  if (req.method === 'POST' && url.pathname === '/api/transcribe') {
    try {
      const provider=req.headers['x-ai-provider']==='gemini'?'gemini':'openai';
      const transcriptionModel=req.headers['x-ai-model'];
      const apiKey=provider==='gemini'?(req.headers['x-gemini-key']||process.env.GEMINI_API_KEY):(req.headers['x-openai-key']||process.env.OPENAI_API_KEY);
      if(!apiKey) return send(res,503,{error:`Add your ${provider==='gemini'?'Gemini':'OpenAI'} API key in AI settings to transcribe this recording.`});
      const audio=await rawBody(req); if(!audio.length) return send(res,400,{error:'No audio was recorded.'});
      const type=(req.headers['content-type']||'audio/webm').split(';')[0];
      let response, result;
      if(provider==='gemini') {
        const mimeType=['audio/webm','audio/ogg','audio/wav','audio/mp4','audio/mpeg','audio/aac'].includes(type)?type:'audio/webm';
        const model=typeof transcriptionModel==='string'&&/^gemini-[a-zA-Z0-9.-]+$/.test(transcriptionModel)?transcriptionModel:'gemini-3.8-flash';
        response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:'Transcribe the spoken audio verbatim in the language spoken. Keep the original language and script. Return only the transcription, with no commentary.'},{inline_data:{mime_type:mimeType,data:audio.toString('base64')}}]}],generationConfig:{temperature:0}})});
        result=await response.json();
        if(!response.ok)return send(res,response.status,{error:result.error?.message||'Gemini could not transcribe this recording.'});
        const transcript=result.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
        return send(res,200,{transcript:transcript||''});
      }
      const ext=type.includes('ogg')?'ogg':type.includes('mp4')?'mp4':type.includes('wav')?'wav':'webm';
      const form=new FormData(); form.append('file',new Blob([audio],{type}),`recording.${ext}`); form.append('model','gpt-4o-mini-transcribe');
      response=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{'Authorization':`Bearer ${apiKey}`},body:form}); result=await response.json();
      if(!response.ok)return send(res,response.status,{error:result.error?.message||'OpenAI could not transcribe this recording.'});
      return send(res,200,{transcript:result.text||''});
    } catch(e) { return send(res,500,{error:e.message||'Transcription failed.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const { messages, mode='guidance', model=defaultModel, provider='openai' } = await bodyJson(req);
      const apiKey = provider === 'gemini' ? (req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY) : (req.headers['x-openai-key'] || process.env.OPENAI_API_KEY);
      if (!Array.isArray(messages) || !messages.length) return send(res,400,{error:'Add a message to get started.'});
      if (messages.length > 30 || messages.some(m => typeof m.content !== 'string' || m.content.length > 12000)) return send(res,400,{error:'This conversation is too long. Start a new case or shorten your message.'});
      if (!['openai','gemini'].includes(provider)) return send(res,400,{error:'Choose OpenAI or Gemini in AI settings.'});
      if (!apiKey) return send(res,503,{error:`Add your ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key in AI settings to continue.`});
      if (typeof model !== 'string' || (provider === 'openai' ? !/^gpt-[a-zA-Z0-9.-]+$/.test(model) : !/^gemini-[a-zA-Z0-9.-]+$/.test(model))) return send(res,400,{error:`Choose a ${provider === 'gemini' ? 'Gemini' : 'GPT'} model from AI settings.`});
      const extra = mode === 'draft' ? '\nThe user wants a usable legal document draft. Provide a clearly labeled editable draft, mark missing facts with [PLACEHOLDERS], do not invent legal citations, then add a concise pre-send verification checklist.' : '';
      const practice = mode === 'practice' ? '\nThe user wants to practise a conversation. Role-play one realistic counterpart at a time (for example landlord, employer, seller, or official) without making threats or pretending to be a real person. Let the user respond, then offer concise feedback on clarity, facts, and documents. Do not claim the role-play predicts an actual legal outcome.' : '';
      const caseSummary = mode === 'case_summary' ? '\nThe user wants a structured case file from the facts they provided. Organize people/location, dated chronology, each side’s position, existing and potential evidence, unknowns, and practical next steps. Label unverified facts and unknown dates explicitly. Do not add facts or legal citations that were not established.' : '';
      const response = provider === 'gemini'
        ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method:'POST', headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
            body:JSON.stringify({ systemInstruction:{parts:[{text:systemPrompt+extra+practice+caseSummary}]}, contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})), generationConfig:{temperature:0.25} })
          })
        : await fetch('https://api.openai.com/v1/chat/completions', {
            method:'POST', headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
            body:JSON.stringify({ model, temperature:0.25, messages:[{role:'system',content:systemPrompt+extra+practice+caseSummary},...messages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}))] })
          });
      const result = await response.json();
      if (!response.ok) return send(res,response.status===401?502:response.status,{error:result.error?.message || 'The AI service could not answer right now.'});
      const reply = provider === 'gemini' ? result.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') : result.choices?.[0]?.message?.content;
      return send(res,200,{reply:reply || 'The model returned no text. Try again or choose another model.'});
    } catch (e) { return send(res,500,{error:e.message || 'Something went wrong.'}); }
  }
  send(res,404,{error:'Not found'});
});
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
server.listen(port,host,()=>console.log(`Nyaya AI ready at http://${host}:${port}`));
