// SPDX-License-Identifier: GPL-3.0-only
package local.studydesk.android;
import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.Set;
import java.util.HashSet;

final class Store {
    final File root;
    Store(Context context) throws IOException {
        root=new File(context.getFilesDir(),"study");
        if(!root.exists()&&!root.mkdirs())throw new IOException("无法建立应用目录");
        // Any uncommitted batch from an interrupted import is disposable.
        File[] files=root.listFiles(); if(files!=null)for(File f:files)if(f.getName().startsWith(".import-"))remove(f);
        // Recover an interrupted commit or deletion; corrupt indexes never trigger cleanup.
        try{prune();}catch(Exception ignored){}
    }
    static String id(){return UUID.randomUUID().toString();}
    File file(String name) throws IOException {
        File file=new File(root,name);
        if(!file.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException("文件路径无效");
        return file;
    }
    JSONObject state() throws Exception {
        File f=file("state.json");
        if(!f.exists()&&!new File(f+".bak").exists())return new JSONObject("{\"documents\":[],\"courses\":[],\"folders\":[],\"prefs\":{}}");
        try(InputStream in=new AtomicFile(f).openRead()){return new JSONObject(new String(MainActivity.read(in,24*1024*1024),StandardCharsets.UTF_8));}
    }
    void state(JSONObject state) throws Exception {write("state.json",state.toString());}
    void write(String name,String value) throws IOException {
        File f=file(name);if(!f.getParentFile().exists()&&!f.getParentFile().mkdirs())throw new IOException("无法建立保存目录");
        AtomicFile atomic=new AtomicFile(f);FileOutputStream out=null;
        try{out=atomic.startWrite();out.write(value.getBytes(StandardCharsets.UTF_8));atomic.finishWrite(out);}
        catch(IOException ex){if(out!=null)atomic.failWrite(out);throw ex;}
    }
    JSONObject note(String id) throws Exception {
        if(!id.matches("[a-zA-Z0-9_-]{1,100}"))throw new IOException("笔记标识无效");
        File f=file("notes/"+id+".json");
        if(!f.exists()&&!new File(f+".bak").exists())return new JSONObject();
        try(InputStream in=new AtomicFile(f).openRead()){return new JSONObject(new String(MainActivity.read(in,24*1024*1024),StandardCharsets.UTF_8));}
    }
    void note(String id,JSONObject data) throws Exception {
        if(!id.matches("[a-zA-Z0-9_-]{1,100}"))throw new IOException("笔记标识无效");
        write("notes/"+id+".json",data.toString());
    }
    void prune() throws Exception {
        JSONObject state=state();Set<String> keep=new HashSet<>(),notes=new HashSet<>();
        for(String collection:new String[]{"documents","courses"}){
            JSONArray list=state.getJSONArray(collection);
            for(int i=0;i<list.length();i++){JSONObject item=list.getJSONObject(i);String file=item.optString("file");if(!file.isEmpty())keep.add(file(file).getCanonicalPath());notes.add((collection.equals("documents")?"doc-":"course-")+item.getString("id")+".json");}
        }
        File imports=file("imports");if(imports.exists())pruneFiles(imports,imports.getCanonicalPath()+File.separator,keep);
        File[] saved=file("notes").listFiles();if(saved!=null)for(File note:saved){String name=note.getName();String base=name.replaceFirst("\\.(bak|new)$","");if((base.startsWith("doc-")||base.startsWith("course-"))&&!notes.contains(base))remove(note);}
    }
    static void pruneFiles(File directory,String boundary,Set<String> keep) throws IOException {
        File[] files=directory.listFiles();if(files==null)return;
        for(File child:files){String canonical=child.getCanonicalPath();if(!canonical.startsWith(boundary))continue;
            if(child.isDirectory()){pruneFiles(child,boundary,keep);File[] remaining=child.listFiles();if(remaining!=null&&remaining.length==0)remove(child);}
            else if(!keep.contains(canonical))remove(child);
        }
    }
    static void remove(File file) throws IOException {
        File[] children=file.listFiles();if(children!=null)for(File child:children)remove(child);
        if(file.exists()&&!file.delete())throw new IOException("临时文件清理失败");
    }
}
