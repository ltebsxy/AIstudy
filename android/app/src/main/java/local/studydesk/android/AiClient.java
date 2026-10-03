// SPDX-License-Identifier: GPL-3.0-only
package local.studydesk.android;
import android.content.Context;
import android.security.keystore.*;
import android.util.Base64;
import org.json.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

final class AiClient {
    final Context context;final Store store;
    AiClient(Context context,Store store){this.context=context;this.store=store;}
    javax.crypto.SecretKey key() throws Exception {
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
        String alias="AI-StudyDesk-API";
        if(!keys.containsAlias(alias)){
            KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey();
        }
        return (javax.crypto.SecretKey)keys.getKey(alias,null);
    }
    String secret() throws Exception {
        String value=context.getSharedPreferences("ai",0).getString("secret","");if(value.isEmpty())return "";
        String[] parts=value.split(":");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
    void saveSecret(String value) throws Exception {
        if(value.length()>8192)throw new IOException("API Key 过长");
        if(value.isEmpty()){if(!context.getSharedPreferences("ai",0).edit().remove("secret").commit())throw new IOException("密钥清除失败");return;}
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        String encoded=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if(!context.getSharedPreferences("ai",0).edit().putString("secret",encoded).commit())throw new IOException("密钥保存失败");
    }
    JSONObject config() throws Exception {
        JSONObject config=store.note("ai-config");config.put("hasKey",context.getSharedPreferences("ai",0).contains("secret"));return config;
    }
    static URL endpoint(String value) throws Exception {
        URL url=new URL(value);
        if(!url.getProtocol().equals("https")||url.getHost().isEmpty()||url.getUserInfo()!=null||url.getRef()!=null)throw new IOException("请填写 HTTPS Chat Completions 接口的完整地址");return url;
    }
    void configure(JSONObject input) throws Exception {
        endpoint(input.getString("endpoint"));String model=input.getString("model").trim();if(model.isEmpty()||model.length()>200)throw new IOException("请填写实际模型 ID");
        if(input.has("key"))saveSecret(input.getString("key"));
        store.note("ai-config",new JSONObject().put("endpoint",input.getString("endpoint")).put("model",model).put("prompt",input.optString("prompt","自然友好，语言精简，数学严谨，公式使用 LaTeX。")));
    }
    String chat(JSONObject input) throws Exception {
        JSONObject config=config();String token=secret();if(token.isEmpty())throw new IOException("请先在 AI 设置中配置 API Key");
        JSONArray messages=input.getJSONArray("messages");if(messages.length()<1||messages.length()>40)throw new IOException("上下文过长，请清除上下文");
        JSONArray clean=new JSONArray().put(new JSONObject().put("role","system").put("content",config.optString("prompt")));
        for(int i=0;i<messages.length();i++){JSONObject m=messages.getJSONObject(i);String role=m.getString("role");if(!role.equals("user")&&!role.equals("assistant"))throw new IOException("消息类型无效");Object content=m.get("content");if(!(content instanceof String||content instanceof JSONArray))throw new IOException("消息内容无效");clean.put(new JSONObject().put("role",role).put("content",content));}
        byte[] body=new JSONObject().put("model",config.getString("model")).put("messages",clean).put("stream",false).toString().getBytes(StandardCharsets.UTF_8);
        if(body.length>12*1024*1024)throw new IOException("请求内容过大");
        HttpURLConnection conn=(HttpURLConnection)endpoint(config.getString("endpoint")).openConnection();
        try{
            conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(20000);conn.setReadTimeout(90000);conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Authorization","Bearer "+token);conn.setRequestProperty("Content-Type","application/json");
            try(OutputStream out=conn.getOutputStream()){out.write(body);}int code=conn.getResponseCode();if(code<200||code>=300)throw new IOException("AI 服务返回 HTTP "+code+"；请检查接口、模型与额度");
            try(InputStream in=conn.getInputStream()){JSONObject response=new JSONObject(new String(MainActivity.read(in,4*1024*1024),StandardCharsets.UTF_8));return response.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content");}
        }finally{conn.disconnect();}
    }
}
