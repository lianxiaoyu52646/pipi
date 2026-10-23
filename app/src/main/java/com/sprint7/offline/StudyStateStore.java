package com.sprint7.offline;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;
import org.json.JSONObject;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Safe V2 incremental SQLite store. Existing V1 snapshots remain readable;
 * migrations never drop user tables. Each update is one SQLite transaction.
 * Large vocab/mistakes/readerWords maps are stored per word, not as one BLOB.
 */
public final class StudyStateStore extends SQLiteOpenHelper {
    private static final String TAG="PipiStudySQLite";
    private static final String[] SPLIT={"vocab","mistakes","readerWords"};
    private static final String[] HISTORIES={"mistakeEvents","writingHistory","listenHistory","readHistory","speakingHistory","dictationHistory","soundHistory","mockHistory","bookExamHistory","stageHistory"};
    private int commitsSinceCheckpoint=0;
    private Map<String,String> cachedHashes=null;
    public StudyStateStore(Context context) { super(context,"pipi_study_safety_v1.db",null,2); }
    private static void tables(SQLiteDatabase db){
        db.execSQL("CREATE TABLE IF NOT EXISTS study_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,sha256 TEXT NOT NULL,saved_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS aux_state(key TEXT PRIMARY KEY,payload TEXT NOT NULL,sha256 TEXT NOT NULL,saved_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS study_parts(scope TEXT NOT NULL,item_key TEXT NOT NULL,payload TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(scope,item_key))");
        db.execSQL("CREATE TABLE IF NOT EXISTS study_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,saved_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE IF NOT EXISTS study_previous(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,sha256 TEXT NOT NULL,saved_at INTEGER NOT NULL)");
    }
    @Override public void onCreate(SQLiteDatabase db){tables(db);}
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){tables(db);}
    private static String sha(String value)throws Exception{
        byte[] b=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder s=new StringBuilder(b.length*2);for(byte v:b)s.append(String.format(Locale.US,"%02x",v&255));return s.toString();
    }
    private static boolean valid(String raw){
        if(raw==null||raw.length()==0||raw.length()>12_000_000)return false;
        try{JSONObject o=new JSONObject(raw);return o.optInt("settingsVersion")==1 && o.optJSONObject("vocab")!=null && o.optJSONObject("dayTasks")!=null;}catch(Exception ex){return false;}
    }
    private static long revision(String raw){try{return new JSONObject(raw).optLong("_pipiRevision",0L);}catch(Exception e){return -1;}}
    private static boolean split(String key){for(String s:SPLIT)if(s.equals(key))return true;return false;}
    private static String jsonValue(Object value){String array=new JSONArray().put(value).toString();return array.substring(1,array.length()-1);}
    private static boolean history(String key){for(String s:HISTORIES)if(s.equals(key))return true;return false;}
    private static String rowKey(String scope,String key){return scope+"|"+key;}
    private static void checkpoint(SQLiteDatabase db,String raw)throws Exception{
        try(Cursor c=db.rawQuery("SELECT payload,sha256 FROM study_state WHERE id=1",null)){
            if(c.moveToFirst()){
                String old=c.getString(0),hash=c.getString(1);
                if(valid(old)&&sha(old).equals(hash)){
                    ContentValues prev=new ContentValues();prev.put("id",1);prev.put("payload",old);prev.put("sha256",hash);prev.put("saved_at",System.currentTimeMillis());
                    db.insertWithOnConflict("study_previous",null,prev,SQLiteDatabase.CONFLICT_REPLACE);
                }
            }
        }
        ContentValues latest=new ContentValues();latest.put("id",1);latest.put("payload",raw);latest.put("sha256",sha(raw));latest.put("saved_at",System.currentTimeMillis());
        if(db.insertWithOnConflict("study_state",null,latest,SQLiteDatabase.CONFLICT_REPLACE)<0)throw new Exception("checkpoint insert failed");
    }
    /** Full snapshot input for backward JS compatibility; only changed SQLite rows are written. */
    /** Atomic optimistic commit; reject a stale WebView rather than losing a newer revision. */
    public synchronized boolean writeIfRevision(String raw,long expected){
        if(!valid(raw)||revision(raw)!=expected+1)return false;
        String previous=read();
        if(previous.isEmpty())return expected==0 && write(raw);
        if(revision(previous)!=expected){Log.w(TAG,"Rejected stale state commit: expected="+expected+", stored="+revision(previous));return false;}
        return write(raw);
    }
    public synchronized boolean write(String raw){
        if(!valid(raw))return false;
        try{
            JSONObject object=new JSONObject(raw);
            SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
            try{
                tables(db);
                HashMap<String,String> oldHashes=new HashMap<>();
                if(cachedHashes!=null)oldHashes.putAll(cachedHashes);
                else try(Cursor c=db.rawQuery("SELECT scope,item_key,sha256 FROM study_parts",null)){
                    while(c.moveToNext())oldHashes.put(rowKey(c.getString(0),c.getString(1)),c.getString(2));
                }
                HashMap<String,String> newHashes=new HashMap<>(oldHashes);
                Set<String> seen=new HashSet<>();
                Iterator<String> fields=object.keys();
                while(fields.hasNext()){
                    String field=fields.next();Object val=object.get(field);
                    if(split(field)&&val instanceof JSONObject){
                        JSONObject map=(JSONObject)val;Iterator<String> keys=map.keys();
                        while(keys.hasNext()){String key=keys.next();putPart(db,oldHashes,newHashes,seen,field,key,jsonValue(map.get(key)));}
                        // Marker preserves empty maps across reads.
                        putPart(db,oldHashes,newHashes,seen,"root",field,"{}");
                    }else if(history(field)&&val instanceof JSONArray){
                        JSONArray entries=(JSONArray)val;
                        for(int i=0;i<entries.length();i++)putPart(db,oldHashes,newHashes,seen,"history:"+field,String.valueOf(i),jsonValue(entries.get(i)));
                        putPart(db,oldHashes,newHashes,seen,"root",field,"[]");
                    }else putPart(db,oldHashes,newHashes,seen,"root",field,jsonValue(val));
                }
                for(String oldKey:oldHashes.keySet())if(!seen.contains(oldKey)){
                    int sep=oldKey.indexOf('|');db.delete("study_parts","scope=? AND item_key=?",new String[]{oldKey.substring(0,sep),oldKey.substring(sep+1)});
                    newHashes.remove(oldKey);
                }
                ContentValues meta=new ContentValues();meta.put("id",1);meta.put("revision",object.optLong("_pipiRevision",0));meta.put("saved_at",System.currentTimeMillis());
                db.insertWithOnConflict("study_meta",null,meta,SQLiteDatabase.CONFLICT_REPLACE);
                if(commitsSinceCheckpoint>=19||!hasCheckpoint(db)){checkpoint(db,raw);commitsSinceCheckpoint=0;}
                db.setTransactionSuccessful();commitsSinceCheckpoint++;
                // Cache will only be published if the whole transaction succeeds.
                db.endTransaction();cachedHashes=newHashes;
            }catch(Exception ex){db.endTransaction();cachedHashes=null;throw ex;}
            return true;
        }catch(Exception e){Log.e(TAG,"Incremental state commit failed",e);return false;}
    }
    private static boolean hasCheckpoint(SQLiteDatabase db){try(Cursor c=db.rawQuery("SELECT 1 FROM study_state WHERE id=1",null)){return c.moveToFirst();}}
    private static void putPart(SQLiteDatabase db,Map<String,String> oldHashes,Map<String,String> nextHashes,Set<String> seen,String scope,String key,String value)throws Exception{
        String combined=rowKey(scope,key);seen.add(combined);String digest=sha(value);
        if(digest.equals(oldHashes.get(combined)))return;
        ContentValues v=new ContentValues();v.put("scope",scope);v.put("item_key",key);v.put("payload",value);v.put("sha256",digest);
        if(db.insertWithOnConflict("study_parts",null,v,SQLiteDatabase.CONFLICT_REPLACE)<0)throw new Exception("part commit failed: "+scope);
        nextHashes.put(combined,digest);
    }
    private static String readCheckpoint(SQLiteDatabase db,String table){
        try(Cursor c=db.rawQuery("SELECT payload,sha256 FROM "+table+" WHERE id=1",null)){
            if(c.moveToFirst()){
                String raw=c.getString(0);if(valid(raw)&&sha(raw).equals(c.getString(1)))return raw;
            }
        }catch(Exception e){Log.w(TAG,"Snapshot unavailable: "+table,e);}return "";
    }
    private static String readParts(SQLiteDatabase db){
        try{
            JSONObject assembled=new JSONObject();Map<String,JSONObject> sub=new HashMap<>();Map<String,java.util.TreeMap<Integer,Object>> historyRows=new HashMap<>();int count=0;
            try(Cursor c=db.rawQuery("SELECT scope,item_key,payload,sha256 FROM study_parts",null)){
                while(c.moveToNext()){
                    String scope=c.getString(0),key=c.getString(1),value=c.getString(2);
                    if(!sha(value).equals(c.getString(3)))return "";
                    Object decoded=new org.json.JSONTokener(value).nextValue();
                    if("root".equals(scope))assembled.put(key,decoded);
                    else if(scope.startsWith("history:"))historyRows.computeIfAbsent(scope.substring(8),k->new java.util.TreeMap<>()).put(Integer.parseInt(key),decoded);
                    else sub.computeIfAbsent(scope,k->new JSONObject()).put(key,decoded);
                    count++;
                }
            }
            if(count==0)return "";
            for(Map.Entry<String,JSONObject> part:sub.entrySet())assembled.put(part.getKey(),part.getValue());
            for(Map.Entry<String,java.util.TreeMap<Integer,Object>> rows:historyRows.entrySet()){
                JSONArray list=new JSONArray();int expected=0;
                for(Map.Entry<Integer,Object> row:rows.getValue().entrySet()){
                    if(row.getKey()!=expected++)return "";list.put(row.getValue());
                }
                assembled.put(rows.getKey(),list);
            }
            String raw=assembled.toString();
            if(!valid(raw))return "";
            try(Cursor c=db.rawQuery("SELECT revision FROM study_meta WHERE id=1",null)){
                if(!c.moveToFirst()||c.getLong(0)!=revision(raw))return "";
            }
            return raw;
        }catch(Exception e){Log.e(TAG,"State part recovery failed",e);return "";}
    }
    public synchronized String read(){
        try{
            SQLiteDatabase db=getReadableDatabase();String latest=readParts(db),snapshot=readCheckpoint(db,"study_state"),previous=readCheckpoint(db,"study_previous");
            String best=latest;
            if(revision(snapshot)>revision(best))best=snapshot;
            if(revision(previous)>revision(best))best=previous;
            return best;
        }catch(Exception e){Log.e(TAG,"Read failed",e);return "";}
    }
    public synchronized boolean writeReaderProgress(String raw){
        if(raw==null||raw.length()>2_000_000)return false;
        try{
            String clean=new JSONObject(raw).toString();SQLiteDatabase db=getWritableDatabase();
            ContentValues v=new ContentValues();v.put("key","originals_progress");v.put("payload",clean);v.put("sha256",sha(clean));v.put("saved_at",System.currentTimeMillis());
            return db.insertWithOnConflict("aux_state",null,v,SQLiteDatabase.CONFLICT_REPLACE)>=0;
        }catch(Exception e){Log.e(TAG,"Reader progress commit failed",e);return false;}
    }
    public synchronized boolean clearReaderProgress(){
        try{return getWritableDatabase().delete("aux_state","key=?",new String[]{"originals_progress"})>=0;}
        catch(Exception e){Log.e(TAG,"Reader bookmark reset failed",e);return false;}
    }
    public synchronized String readReaderProgress(){
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload,sha256 FROM aux_state WHERE key='originals_progress'",null)){
            if(!c.moveToFirst())return "";String raw=c.getString(0);return sha(raw).equals(c.getString(1))?raw:"";
        }catch(Exception e){Log.e(TAG,"Reader progress read failed",e);return "";}
    }
    public synchronized boolean clear(){
        try{SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try{
            db.delete("study_parts",null,null);db.delete("study_meta",null,null);db.delete("study_state",null,null);
            db.delete("study_previous",null,null);db.delete("aux_state",null,null);db.setTransactionSuccessful();
        }finally{db.endTransaction();}commitsSinceCheckpoint=0;cachedHashes=null;return true;}
        catch(Exception e){Log.e(TAG,"Clear failed",e);return false;}
    }
}
