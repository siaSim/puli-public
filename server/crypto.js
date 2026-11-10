const encoder = new TextEncoder();
export const encode = value => encoder.encode(value);
export function base64(bytes) { let text = ''; for (let i=0; i<bytes.length; i+=8192) text += String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(text); }
export const unbase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export const base64url = bytes => base64(bytes).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export const randomToken = (length=32) => base64url(crypto.getRandomValues(new Uint8Array(length)));
export async function hash(value) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(value)))); }
async function aes(secret) { const bytes=unbase64(secret); if(bytes.length!==32) throw new Error('Invalid encryption key'); return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']); }
export async function seal(value, secret) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aes(secret),encode(JSON.stringify(value))));
 return base64(iv)+'.'+base64(bytes);
}
export async function unseal(value, secret) {
 const [iv,bytes]=value.split('.');
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},await aes(secret),unbase64(bytes))));
}
export async function verifySignature(body, signature, secret) {
 if(!/^sha256=[a-f0-9]{64}$/.test(signature||'')) return false;
 const bytes=Uint8Array.from(signature.slice(7).match(/../g), s=>parseInt(s,16));
 const key=await crypto.subtle.importKey('raw',encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,bytes,body);
}
function der(tag, bytes) {
 const n=bytes.length; let length;
 if(n<128) length=[n]; else {const out=[]; for(let v=n;v;v>>>=8)out.unshift(v&255);length=[128|out.length,...out];}
 return new Uint8Array([tag,...length,...bytes]);
}
export function privateKeyBytes(pem) {
 const bytes=unbase64(pem.replace(/-----[^-]+-----|\s/g,''));
 if(!pem.includes('BEGIN RSA PRIVATE KEY')) return bytes;
 // PKCS#1 -> PKCS#8: version, rsaEncryption AlgorithmIdentifier, privateKey OCTET STRING.
 const algorithm=[48,13,6,9,42,134,72,134,247,13,1,1,1,5,0];
 return der(48,new Uint8Array([2,1,0,...algorithm,...der(4,bytes)]));
}
export async function appJWT(config, now=Date.now()) {
 const header=base64url(encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const payload=base64url(encode(JSON.stringify({iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+540,iss:String(config.id)})));
 const key=await crypto.subtle.importKey('pkcs8',privateKeyBytes(config.pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encode(header+'.'+payload)));
 return header+'.'+payload+'.'+base64url(signature);
}
