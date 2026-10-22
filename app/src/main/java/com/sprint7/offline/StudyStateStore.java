package com.sprint7.offline;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Independent SQLite safety mirror; never deletes or implicitly replaces WebView records. */
public final class StudyStateStore extends SQLiteOpenHelper {
    public StudyStateStore(Context context) {super(context, "pipi_study_safety_v1.db", null, 1);}
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE study_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, sha256 TEXT NOT NULL, saved_at INTEGER NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {throw new IllegalStateException("Never erase learning data automatically");}
    private static String sha(String input) throws Exception {
        byte[] b=MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder s=new StringBuilder(); for(byte x:b)s.append(String.format(java.util.Locale.US,"%02x",x&255));return s.toString();
    }
    private static boolean valid(String raw) {
        if(raw==null||raw.isEmpty()||raw.length()>12_000_000)return false;
        try {JSONObject obj=new JSONObject(raw);return obj.optInt("settingsVersion")==1&&obj.optJSONObject("vocab")!=null&&obj.optJSONObject("dayTasks")!=null;} catch(Exception e) {return false;}
    }
    public synchronized boolean write(String raw) {
        if(!valid(raw))return false;
        try {
            SQLiteDatabase db=getWritableDatabase();
            db.beginTransaction();
            try {
                android.content.ContentValues v=new android.content.ContentValues();
                v.put("id",1);v.put("payload",raw);v.put("sha256",sha(raw));v.put("saved_at",System.currentTimeMillis());
                if(db.insertWithOnConflict("study_state",null,v,SQLiteDatabase.CONFLICT_REPLACE)<0)throw new Exception("SQLite insert failed");
                db.setTransactionSuccessful();
            } finally {db.endTransaction();}
            return true;
        } catch(Exception e) {android.util.Log.e("PipiStudySQLite","Cannot mirror learning data",e);return false;}
    }
    public synchronized String read() {
        try(Cursor cursor=getReadableDatabase().rawQuery("SELECT payload,sha256 FROM study_state WHERE id=1",null)) {
            if(!cursor.moveToFirst())return "";
            String raw=cursor.getString(0);return valid(raw)&&sha(raw).equals(cursor.getString(1))?raw:"";
        } catch(Exception e) {android.util.Log.e("PipiStudySQLite","Cannot read learning data mirror",e);return "";}
    }
}
