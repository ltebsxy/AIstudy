// SPDX-License-Identifier: GPL-3.0-only
package local.studydesk.android;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class Importer {
    static final long MB=1024L*1024;
    static final Set<String> READ=new HashSet<>(Arrays.asList("txt","md","markdown","pdf","png","jpg","jpeg","webp","gif","bmp"));
    final Context context;final Store store;long total;
    record Entry(Uri uri,String name,String path,long size){}
    Importer(Context context,Store store){this.context=context;this.store=store;}
    static String safePath(String path) throws IOException {
        path=path.replace('\\','/');
        if(path.isEmpty()||path.startsWith("/")||path.contains(":")||path.contains("\0"))throw new IOException("清单路径越界或无效");
        for(String part:path.split("/",-1))if(part.isEmpty()||part.equals("..")||part.startsWith("."))throw new IOException("不允许隐藏或越界路径");
        return path;
    }
    static String ext(String name){int dot=name.lastIndexOf('.');return dot<0?"":name.substring(dot+1).toLowerCase(Locale.ROOT);}
    Entry info(Uri uri,String path) throws Exception {
        try(Cursor c=context.getContentResolver().query(uri,new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_SIZE},null,null,null)){
            if(c==null||!c.moveToFirst())throw new IOException("文件无法访问");
            String name=c.getString(0);return new Entry(uri,name,path==null?safePath(name):path,c.isNull(1)?-1:c.getLong(1));
        }
    }
    void scan(Uri tree,String documentId,String parent,Map<String,Entry> result,Set<String> visited,int depth) throws Exception {
        if(depth>32||!visited.add(documentId))throw new IOException("目录过深或循环引用");
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,documentId);
        try(Cursor c=context.getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_FLAGS},null,null,null)){
            if(c==null)throw new IOException("无法读取目录");
            while(c.moveToNext()){
                String id=c.getString(0),name=c.getString(1);if(name.startsWith("."))continue;
                if(name.contains("/")||name.contains("\\"))throw new IOException("提供者返回无效文件名");
                String path=safePath(parent+name);
                if(DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))){scan(tree,id,path+"/",result,visited,depth+1);continue;}
                if((c.getInt(4)&DocumentsContract.Document.FLAG_VIRTUAL_DOCUMENT)!=0)continue;
                if(result.size()>=10000)throw new IOException("目录文件过多");
                if(result.put(path,new Entry(DocumentsContract.buildDocumentUriUsingTree(tree,id),name,path,c.isNull(3)?-1:c.getLong(3)))!=null)throw new IOException("重复文件路径");
            }
        }
    }
    byte[] bytes(Entry e,long limit) throws Exception {
        if(e.size==0||e.size>limit)throw new IOException(e.name+" 为空或超过大小限制");
        try(InputStream in=context.getContentResolver().openInputStream(e.uri)){
            if(in==null)throw new IOException("无法读取 "+e.name);
            byte[] bytes=MainActivity.read(in,limit);if(bytes.length==0)throw new IOException(e.name+" 为空");return bytes;
        }
    }
    void copy(Entry e,File dest,long limit) throws Exception {
        if(e.size==0||e.size>limit)throw new IOException(e.name+" 为空或超过大小限制");
        if(!dest.getParentFile().exists()&&!dest.getParentFile().mkdirs())throw new IOException("导入目录创建失败");
        long count=0;
        try(InputStream in=context.getContentResolver().openInputStream(e.uri);OutputStream out=new FileOutputStream(dest)){
            if(in==null)throw new IOException("无法读取 "+e.name);byte[] buffer=new byte[32768];int n;
            while((n=in.read(buffer))!=-1){count+=n;total+=n;if(count>limit||total>500*MB)throw new IOException("文件或整个阅读包超过大小限制");out.write(buffer,0,n);}
        }
        if(count==0)throw new IOException(e.name+" 为空");
    }
    JSONObject run(Uri uri,boolean tree,String mode,String parentFolder) throws Exception {
        boolean courses=mode.equals("courses");String batch=Store.id();File stage=store.file(".import-"+batch),committed=store.file("imports/"+batch);
        JSONObject state=store.state();JSONArray documents=state.getJSONArray("documents"),courseList=state.getJSONArray("courses"),folders=state.getJSONArray("folders");
        if(!parentFolder.isEmpty()){
            boolean found=false;for(int i=0;i<folders.length();i++){JSONObject f=folders.getJSONObject(i);if(f.optString("id").equals(parentFolder)&&f.optString("mode").equals(mode))found=true;}
            if(!found)throw new IOException("目标文件夹已不存在");
        }
        Map<String,Entry> entries=new TreeMap<>();String title;
        if(tree){String id=DocumentsContract.getTreeDocumentId(uri);title=info(DocumentsContract.buildDocumentUriUsingTree(uri,id),null).name;scan(uri,id,"",entries,new HashSet<>(),0);}
        else{Entry e=info(uri,null);title=e.name;entries.put(e.path,e);}
        String readingMode="standard";Map<String,String> names=new HashMap<>();List<Entry> selected=new ArrayList<>();
        if(!courses&&tree&&entries.containsKey("reading-pack.json")){
            JSONObject manifest=new JSONObject(new String(bytes(entries.get("reading-pack.json"),MB),StandardCharsets.UTF_8).replaceFirst("^\\uFEFF",""));
            if(!(manifest.opt("version") instanceof Number)||manifest.getDouble("version")!=1)throw new IOException("仅支持 reading-pack.json version 1");
            if(manifest.has("title")){title=manifest.getString("title");if(title.trim().isEmpty()||title.length()>80)throw new IOException("阅读包名称无效");}
            readingMode=manifest.optString("readingMode","standard");if(!Arrays.asList("english","standard").contains(readingMode))throw new IOException("readingMode 无效");
            JSONArray list=manifest.getJSONArray("documents");if(list.length()<1||list.length()>500)throw new IOException("清单需包含 1–500 个正文文件");
            Set<String> seen=new HashSet<>();Set<String> identities=new HashSet<>();
            for(int i=0;i<list.length();i++){
                JSONObject item=list.getJSONObject(i);String path=safePath(item.getString("file"));Entry e=entries.get(path);
                if(!seen.add(path)||e!=null&&!identities.add(e.uri.toString()))throw new IOException("清单包含重复文件");
                if(e==null||!READ.contains(ext(path)))throw new IOException("清单文件不存在或格式不支持："+path);
                String name=item.optString("name",e.name);if(name.trim().isEmpty()||name.length()>200)throw new IOException("文档名称无效");names.put(path,name);selected.add(e);
            }
        }else for(Entry e:entries.values())if(courses?ext(e.name).equals("json"):READ.contains(ext(e.name)))selected.add(e);
        if(selected.isEmpty())throw new IOException(courses?"请导入普通课程 JSON；此文件夹没有支持的课程文件":"此格式暂不支持。可导入 TXT、Markdown、PDF 或常见图片");
        if(selected.size()>500)throw new IOException("导入文件超过 500 个");
        JSONArray warnings=new JSONArray();Map<String,String> folderIds=new HashMap<>();folderIds.put("",parentFolder);
        if(tree){String rootId=Store.id();folders.put(new JSONObject().put("id",rootId).put("name",title).put("parent",parentFolder).put("mode",mode));folderIds.put("",rootId);}
        int count=0;boolean moved=false;
        try{
            if(!stage.mkdirs())throw new IOException("导入暂存目录创建失败");
            for(Entry e:selected){
                String parent=e.path.contains("/")?e.path.substring(0,e.path.lastIndexOf('/')):"";
                String folder=ensureFolder(parent,folderIds,folders,mode);
                if(courses){
                    Object raw=new JSONTokener(new String(bytes(e,20*MB),StandardCharsets.UTF_8).replaceFirst("^\\uFEFF","")).nextValue();
                    JSONArray list=raw instanceof JSONArray?(JSONArray)raw:new JSONArray().put(raw);
                    for(int i=0;i<list.length();i++){
                        JSONObject course=list.getJSONObject(i);
                        if("programming".equals(course.optString("kind"))||course.has("programming")){warnings.put(course.optString("title",e.name)+"：安卓版暂不支持编程课程");continue;}
                        validateCourse(course);String id=Store.id();
                        // Whitelist mobile course fields; desktop executable/path config never imported.
                        JSONObject clean=new JSONObject();for(String key:new String[]{"title","description","knowledge","knowledgeFormat","questions"})if(course.has(key))clean.put(key,course.get(key));
                        clean.put("id",id).put("kind","standard");
                        for(int q=0;q<clean.getJSONArray("questions").length();q++)clean.getJSONArray("questions").getJSONObject(q).put("id",Store.id());
                        File target=new File(stage,id+".json");try(OutputStream out=new FileOutputStream(target)){out.write(clean.toString().getBytes(StandardCharsets.UTF_8));}
                        courseList.put(new JSONObject().put("id",id).put("title",clean.getString("title")).put("folder",folder).put("file","imports/"+batch+"/"+id+".json").put("added",System.currentTimeMillis()));count++;
                    }
                }else{
                    String extension=ext(e.name);long limit=extension.equals("pdf")?100*MB:Arrays.asList("txt","md","markdown").contains(extension)?5*MB:30*MB;
                    copy(e,new File(stage,e.path),limit);documents.put(new JSONObject().put("id",Store.id()).put("name",names.getOrDefault(e.path,e.name)).put("folder",folder).put("file","imports/"+batch+"/"+e.path).put("ext",extension).put("readingMode",readingMode).put("added",System.currentTimeMillis()));count++;
                }
            }
            if(count==0)throw new IOException(warnings.length()>0?warnings.join("；"):"没有普通课程可导入");
            if(!committed.getParentFile().exists()&&!committed.getParentFile().mkdirs())throw new IOException("保存目录创建失败");
            if(!stage.renameTo(committed))throw new IOException("导入文件提交失败");moved=true;
            // Atomic manifest is the transaction commit. On failure remove the new batch.
            state.put("lastImport"+mode,uri.toString());store.state(state);
            return new JSONObject().put("count",count).put("warnings",warnings);
        }catch(Exception error){Store.remove(moved?committed:stage);throw error;}
    }
    String ensureFolder(String path,Map<String,String> ids,JSONArray folders,String mode) throws Exception {
        if(ids.containsKey(path))return ids.get(path);int slash=path.lastIndexOf('/');String parent=slash<0?"":path.substring(0,slash),name=slash<0?path:path.substring(slash+1);
        String parentId=ensureFolder(parent,ids,folders,mode),id=Store.id();folders.put(new JSONObject().put("id",id).put("name",name).put("parent",parentId).put("mode",mode));ids.put(path,id);return id;
    }
    static void validateCourse(JSONObject c) throws Exception {
        if(c.getString("title").trim().isEmpty()||c.getString("title").length()>80||c.getString("knowledge").trim().isEmpty()||c.getString("knowledge").length()>50000)throw new IOException("课程名称或知识点无效");
        JSONArray qs=c.getJSONArray("questions");if(qs.length()==0||qs.length()>1000)throw new IOException("课程题目数量无效");
        for(int i=0;i<qs.length();i++){
            JSONObject q=qs.getJSONObject(i);String type=q.optString("type","written");if(!Arrays.asList("written","choice","blank").contains(type))throw new IOException("不支持的题型");
            if(q.optString("text").trim().isEmpty()&&q.optString("image").trim().isEmpty())throw new IOException("题目不能为空");
            String image=q.optString("image");if(!image.isEmpty()&&(image.length()>12000000||!image.matches("data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+")))throw new IOException("课程图片格式无效");
            if(type.equals("choice")){JSONArray options=q.getJSONArray("options");if(options.length()<2||options.length()>26)throw new IOException("选择题需要 2–26 个选项");for(int j=0;j<options.length();j++)if(options.getString(j).trim().isEmpty())throw new IOException("选项不能为空");if(q.has("multiple")&&!(q.get("multiple") instanceof Boolean))throw new IOException("multiple 必须是布尔值");}
            if(type.equals("blank")&&q.has("blanks")){JSONArray blanks=q.getJSONArray("blanks");if(blanks.length()>20)throw new IOException("填空数量过多");for(int j=0;j<blanks.length();j++)if(blanks.getString(j).trim().isEmpty())throw new IOException("填空标签不能为空");}
            if(q.has("grading")){JSONObject g=q.getJSONObject("grading");if(g.getString("answer").trim().isEmpty()||g.getJSONArray("criteria").length()==0)throw new IOException("评分依据无效");for(int j=0;j<g.getJSONArray("criteria").length();j++){JSONObject r=g.getJSONArray("criteria").getJSONObject(j);if(r.getString("text").trim().isEmpty()||!Double.isFinite(r.getDouble("points"))||r.getDouble("points")<=0)throw new IOException("评分项无效");}}
        }
    }
}
