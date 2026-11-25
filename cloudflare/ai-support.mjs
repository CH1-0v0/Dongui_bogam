// Public encryption key only. The private key stays outside version control and deployments.
const publicKey={"kty":"RSA","n":"q3B1ehMCWoObFfcpWKxhRmtFlS7cMzNo8mFzigCiJE0wLUbkI_aZoPx8O-2uU4TFulVZ2M6YguZH5Jumxp1vvAVB4YIv9dApqg3au-T7bMIr0TmTp8ZFrEEEB3pCEBMYKLH8ht2l0i9iEBMKYf1SSqzR0P_8kzM9j1BDloeXumyp423_S9U_L3ryFfsMW7ybFdgzInUomO1oCM7JRYScVMq1nGt7icf6KxfdMyIzRsLhx7YuU_zAwFgfwLV43d88OoogTZpdUpCYBd7ccnPIN1Xsdk0v2UduODEXCEWlWakh2k_yQQQE6KETJuVVw7d7SaQJrlcEP4XV3HKSgpoPnQ","e":"AQAB"};
let imported;
export function redactSupportText(message,secrets=[]){
 let text=String(message);
 for(const secret of secrets.filter(s=>typeof s==='string'&&s.length))text=text.split(secret).join('[redacted]');
 return text.replace(/Bearer\s+[^\s,;"']+/gi,'Bearer [redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[redacted-email]').replace(/01[016789][ -]?\d{3,4}[ -]?\d{4}/g,'[redacted-phone]');
}
export async function sealSupportText(message,secrets=[],key=publicKey){
 const text=redactSupportText(message,secrets);
 const bytes=new TextEncoder().encode(text).slice(0,160);
 const encryptKey=key===publicKey?await(imported??=crypto.subtle.importKey('jwk',publicKey,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt'])):await crypto.subtle.importKey('jwk',key,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const sealed=new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},encryptKey,bytes));
 return 'D1.'+btoa(String.fromCharCode(...sealed)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
