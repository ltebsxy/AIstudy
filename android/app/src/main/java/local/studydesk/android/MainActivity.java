// SPDX-License-Identifier: GPL-3.0-only
package local.studydesk.android;
import android.app.Activity;
import android.content.*;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.view.*;
import android.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.GZIPInputStream;

public final class MainActivity extends Activity {
    WebView web;Store store;AiClient ai;final ExecutorService io=Executors.newSingleThreadExecutor(),network=Executors.newSingleThreadExecutor();
    String importMode="documents",importFolder="";boolean importTree,importBusy=false;
    static final String HOST="study.local";
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        try{store=new Store(this);ai=new AiClient(this,store);}catch(Exception e){throw new IllegalStateException("应用数据目录不可用",e);}
        web=new WebView(this);setContentView(web);
        String initialTheme=(getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES?"dark":"light";
        try{JSONObject prefs=store.state().optJSONObject("prefs");String configured=prefs==null?"system":prefs.optString("theme","system");if(!configured.equals("system"))initialTheme=configured;}catch(Exception ignored){}
        appearance(initialTheme);
        web.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        web.requestApplyInsets();WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Bridge(),"AndroidStudy");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !local(request.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return resource(request.getUrl());}
        });
        web.loadUrl("https://"+HOST+"/index.html");
    }
    static boolean local(Uri uri){return "https".equals(uri.getScheme())&&HOST.equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);}
    static byte[] read(InputStream in,long limit) throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new IOException("文件超过大小限制");out.write(buffer,0,n);}return out.toByteArray();}
    WebResourceResponse resource(Uri uri){
        try{
            if(!local(uri))throw new IOException("外部资源被阻止");String path=uri.getPath().substring(1);
            for(String part:path.split("/"))if(part.equals("..")||part.contains("\\"))throw new IOException("无效路径");
            InputStream input;String ext=Importer.ext(path);
            if(path.startsWith("data/")){File f=store.file(path.substring(5));input=new FileInputStream(f);}
            else if(path.startsWith("vendor/ecdict/")&&path.endsWith(".json")&&!path.endsWith("SOURCE.json")){input=new GZIPInputStream(getAssets().open(path+".gz"));}
            else input=getAssets().open(path);
            String mime=switch(ext){case "html"->"text/html";case "js","mjs"->"text/javascript";case "json"->"application/json";case "css"->"text/css";case "svg"->"image/svg+xml";case "png"->"image/png";case "jpg","jpeg"->"image/jpeg";case "webp"->"image/webp";case "gif"->"image/gif";case "bmp"->"image/bmp";case "pdf"->"application/pdf";case "woff2"->"font/woff2";case "woff"->"font/woff";case "ttf"->"font/ttf";case "wasm"->"application/wasm";case "bcmap","pfb","icc"->"application/octet-stream";default->"text/plain";};
            Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");
            headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'");
            return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,input);
        }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream("资源无法读取".getBytes(StandardCharsets.UTF_8)));}
    }
    void script(String code){runOnUiThread(()->{if(web!=null)web.evaluateJavascript(code,null);});}
    void appearance(String theme){runOnUiThread(()->{boolean dark=theme.equals("dark");int color=android.graphics.Color.parseColor(dark?"#171C19":"#F5F6F3");if(web!=null)web.setBackgroundColor(color);getWindow().setStatusBarColor(color);getWindow().setNavigationBarColor(color);int flags=getWindow().getDecorView().getSystemUiVisibility(),mask=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;getWindow().getDecorView().setSystemUiVisibility(dark?flags&~mask:flags|mask);});}
    void result(String id,Object value,String error){script("window.nativeResult("+JSONObject.quote(id)+","+(value==null?"null":value.toString())+","+(error==null?"null":JSONObject.quote(error))+")");}
    void event(String name,Object value){script("window.nativeEvent("+JSONObject.quote(name)+","+value+")");}
    static JSONObject object(String name,Object value){JSONObject data=new JSONObject();try{data.put(name,value);}catch(JSONException ignored){}return data;}
    class Bridge {
        @JavascriptInterface public void request(String id,String op,String raw){
            if(raw.length()>24*1024*1024){result(id,null,"保存内容过大");return;}
            (op.equals("chat")?network:io).execute(()->{
                try{
                    JSONObject p=new JSONObject(raw);Object result;
                    switch(op){
                        case "load":result=store.state();break;
                        case "save":store.state(p);result=new JSONObject().put("ok",true);break;
                        case "note":result=store.note(p.getString("id"));break;
                        case "saveNote":store.note(p.getString("id"),p.getJSONObject("data"));result=new JSONObject().put("ok",true);break;
                        case "cleanup":store.prune();result=new JSONObject().put("ok",true);break;
                        case "aiConfig":result=ai.config();break;
                        case "saveAi":ai.configure(p);result=ai.config();break;
                        case "chat":result=JSONObject.quote(ai.chat(p));break;
                        case "pick":
                            if(importBusy)throw new IOException("正在导入，请稍候");importMode=p.getString("mode");if(!importMode.equals("documents")&&!importMode.equals("courses"))throw new IOException("无效模式");importFolder=p.optString("folder");importTree=p.optBoolean("tree");importBusy=true;runOnUiThread(()->pick());result=new JSONObject().put("ok",true);break;
                        case "systemTheme":result=JSONObject.quote((getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES?"dark":"light");break;
                        case "appearance":appearance(p.optString("theme"));result=new JSONObject().put("ok",true);break;
                        case "exit":result=new JSONObject().put("ok",true);runOnUiThread(()->finish());break;
                        default:throw new IOException("不支持的操作");
                    }
                    result(id,result,null);
                }catch(Exception e){String message=op.equals("chat")&&!(e instanceof IOException)?"AI 回复格式无效或密钥不可用，请重新配置":e.getMessage();result(id,null,message==null?"操作失败":message);}
            });
        }
    }
    void pick(){
        try{
            Intent intent=new Intent(importTree?Intent.ACTION_OPEN_DOCUMENT_TREE:Intent.ACTION_OPEN_DOCUMENT);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            if(!importTree){intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_MIME_TYPES,importMode.equals("courses")?new String[]{"application/json","text/plain","application/octet-stream"}:new String[]{"text/*","application/pdf","image/*","application/octet-stream"});}
            String last=store.state().optString("lastImport"+importMode);if(!last.isEmpty())intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,Uri.parse(last));
            startActivityForResult(intent,42);
        }catch(Exception e){importBusy=false;event("import",object("error","系统文件选择器不可用"));}
    }
    @Override protected void onActivityResult(int request,int code,Intent data){
        super.onActivityResult(request,code,data);if(request!=42)return;
        if(code!=RESULT_OK||data==null||data.getData()==null){importBusy=false;event("import",object("cancelled",true));return;}
        Uri uri=data.getData();int flags=data.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION;
        io.execute(()->{try{
            JSONObject imported=new Importer(this,store).run(uri,importTree,importMode,importFolder);
            try{getContentResolver().takePersistableUriPermission(uri,flags);}catch(SecurityException ignored){imported.put("permissionNote","提供者未允许长期访问；文件已复制到应用目录");}
            event("import",imported);
        }catch(Exception e){event("import",object("error",e.getMessage()==null?"导入失败":e.getMessage()));}finally{importBusy=false;}});
    }
    @Override protected void onPause(){script("window.flushStudy?.()");super.onPause();}
    @Override public void onConfigurationChanged(Configuration config){super.onConfigurationChanged(config);script("window.systemThemeChanged?.("+JSONObject.quote((config.uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES?"dark":"light")+")");}
    @Override public void onBackPressed(){script("window.studyBack?.()");}
    @Override protected void onDestroy(){if(web!=null){web.removeJavascriptInterface("AndroidStudy");web.destroy();web=null;}io.shutdown();network.shutdown();super.onDestroy();}
}
