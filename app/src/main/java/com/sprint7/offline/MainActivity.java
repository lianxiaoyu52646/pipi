package com.sprint7.offline;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JsResult;
import android.webkit.JsPromptResult;
import android.webkit.ValueCallback;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String BASE = "https://appassets.androidplatform.net/assets/";
    private static final int FILE_CHOOSER = 91, SAVE_DOCUMENT = 92, MIC_PERMISSION = 93;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingBytes;
    private String pendingFilename = "Pipi-backup.json";
    private OfflineVoiceEngine voice;
    private ArticleVoiceEngine articleVoice;
    private PermissionRequest pendingPermission;
    private final java.util.concurrent.atomic.AtomicBoolean resumeArticleAfterWord = new java.util.concurrent.atomic.AtomicBoolean(false);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff6259e9);
        getWindow().setNavigationBarColor(0xfff7f7fc);
        web = new WebView(this);
        setContentView(web);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(false);
        ws.setTextZoom(100);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(true); // Android's own file picker for backup import
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setSupportMultipleWindows(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setMediaPlaybackRequiresUserGesture(true);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        web.setWebViewClient(new WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if ("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())) {
                    android.webkit.WebResourceResponse resource=assets.shouldInterceptRequest(uri);
                    if (resource != null) return resource;
                }
                return new android.webkit.WebResourceResponse("text/plain", "UTF-8", 403, "Offline only", new java.util.HashMap<>(),new java.io.ByteArrayInputStream("Not available offline".getBytes(StandardCharsets.UTF_8)));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if("https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost()) && uri.getPath()!=null && uri.getPath().startsWith("/assets/"))return false;
                Toast.makeText(MainActivity.this, "离线模式：不能打开外部网站", Toast.LENGTH_SHORT).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if(fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback=callback;
                Intent intent=new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try { startActivityForResult(Intent.createChooser(intent,"选择皮皮备份或文本"), FILE_CHOOSER); }
                catch(Exception e) {fileCallback.onReceiveValue(null);fileCallback=null;return false;}
                return true;
            }
            @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("确定",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                if(!"https".equals(request.getOrigin().getScheme()) || !"appassets.androidplatform.net".equals(request.getOrigin().getHost())){request.deny();return;}
                boolean audio=false;
                for(String s:request.getResources()) {if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(s))audio=true; else {request.deny();return;}}
                if(!audio){request.deny();return;}
                if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else {pendingPermission=request;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_PERMISSION);}
            }
        });
        web.addJavascriptInterface(new Bridge(),"SprintAndroid");
        voice = new OfflineVoiceEngine(getApplicationContext(), (code, message) -> runOnUiThread(() -> {
            if (web != null) {
                String js = "window.dispatchEvent(new CustomEvent('pipi-tts-status',{detail:{code:" +
                    org.json.JSONObject.quote(code) + ",message:" + org.json.JSONObject.quote(message) + "}}))";
                web.evaluateJavascript(js, null);
            }
            if ("finished".equals(code) || "error".equals(code)) {
                if (resumeArticleAfterWord.getAndSet(false) && articleVoice != null && articleVoice.isReading()) articleVoice.resume();
            }
            if ("error".equals(code)) Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        }));
        articleVoice = new ArticleVoiceEngine(getApplicationContext(), event -> runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('pipi-article-tts',{detail:" + event.toString() + "}))", null);
        }));
        web.loadUrl(BASE+"index.html");
    }
    public class Bridge {
        @JavascriptInterface public String getLibraryVoiceCacheStatus() {
            return LibraryVoiceCacheService.Companion.status(getApplicationContext());
        }
        @JavascriptInterface public void startLibraryVoiceCache(int speakerId, float speed) {
            runOnUiThread(() -> {
                if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 94);
                }
                resumeArticleAfterWord.set(false);
                if (voice != null) voice.stop();
                if (articleVoice != null) articleVoice.releaseModel();
                Intent job = new Intent(MainActivity.this, LibraryVoiceCacheService.class)
                    .setAction(LibraryVoiceCacheService.ACTION_START)
                    .putExtra("speaker", speakerId).putExtra("speed", speed);
                try { startForegroundService(job); }
                catch (Exception e) {Toast.makeText(MainActivity.this, "缓存服务启动失败：" + e.getMessage(), Toast.LENGTH_LONG).show();}
            });
        }
        @JavascriptInterface public void pauseLibraryVoiceCache() {
            runOnUiThread(() -> startService(new Intent(MainActivity.this,LibraryVoiceCacheService.class).setAction(LibraryVoiceCacheService.ACTION_PAUSE)));
        }
        @JavascriptInterface public void clearLibraryVoiceCache() {
            runOnUiThread(() -> startService(new Intent(MainActivity.this,LibraryVoiceCacheService.class).setAction(LibraryVoiceCacheService.ACTION_CLEAR)));
        }
        @JavascriptInterface public void stopSpeech(){ resumeArticleAfterWord.set(false); if (voice!=null) voice.stop(); }
        @JavascriptInterface public void speakArticle(String itemsJson, float speed, int speakerId, String requestToken) {
            resumeArticleAfterWord.set(false);
            // Caching is the user's explicit long-running choice. Reading must NEVER
            // silently send ACTION_PAUSE (old code did so on every narration request).
            // Two Kokoro sessions can exhaust RAM: ask the user to pause explicitly.
            if (LibraryVoiceCacheService.isActive() || LibraryVoiceCacheService.shouldResume(getApplicationContext())) {
                org.json.JSONObject error = new org.json.JSONObject();
                try {
                    error.put("code", "article-error");
                    error.put("token", requestToken == null ? "" : requestToken);
                    error.put("message", "后台语音缓存正在持续运行；如需实时朗读，请先到缓存页面手动点击暂停。缓存不会被自动暂停。");
                } catch (org.json.JSONException ignored) { }
                runOnUiThread(() -> {
                    if(web!=null)web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pipi-article-tts',{detail:" + error.toString() + "}))", null);
                });
                return;
            }
            if (voice != null) voice.releaseModel();
            if (articleVoice != null) articleVoice.speakBatch(itemsJson, speed, speakerId, requestToken);
        }
        @JavascriptInterface public void appendArticle(String itemsJson, String requestToken) {
            if (articleVoice != null) articleVoice.appendBatch(itemsJson, requestToken);
        }
        @JavascriptInterface public void finishArticle(String requestToken) {
            if (articleVoice != null) articleVoice.finishBatch(requestToken);
        }
        @JavascriptInterface public void pauseArticle(){ if (articleVoice != null) articleVoice.pause(); }
        @JavascriptInterface public void resumeArticle(){ if (articleVoice != null) articleVoice.resume(); }
        @JavascriptInterface public void stopArticle(){ resumeArticleAfterWord.set(false); if (articleVoice != null) articleVoice.stop(); }

        @JavascriptInterface public void speak(String text){ speakWithRate(text, 1f); }
        @JavascriptInterface public void speakWithRate(String text, float speed) {
            // Word lookup temporarily pauses the novel; never destroy Kokoro here.
            // Keep the session/token/reading position so an ordinary word lookup
            // does not restart the entire article synthesis pipeline.
            if (articleVoice != null && articleVoice.isReading()) {
                if (!articleVoice.isPaused()) {
                    articleVoice.pause();
                    resumeArticleAfterWord.set(true);
                }
                // A second word tap while Piper is speaking must not clear
                // the pending auto-resume. User-paused narration remains paused.
            } else resumeArticleAfterWord.set(false);
            if (voice!=null) voice.speak(text==null?"":text, speed);
        }
        @JavascriptInterface public void setImmersive(boolean enabled) {
            runOnUiThread(() -> {
                if (isFinishing()) return;
                int layout = android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                int immersive = android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                    | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
                getWindow().getDecorView().setSystemUiVisibility(enabled ? layout | immersive : 0);
            });
        }
        @JavascriptInterface public void saveFile(String filename,String mime,String base64){
            if(base64==null||base64.length()>25_000_000)return;
            try {
                byte[] bytes=Base64.decode(base64,Base64.DEFAULT);
                if(bytes.length>15_000_000)return;
                String clean=(filename==null?"Pipi-data.json":filename).replaceAll("[\\/:*?\"<>|]","_");
                String actualMime=mime!=null&&mime.startsWith("audio/")?"audio/webm":mime!=null&&mime.contains("text")?"text/plain":"application/json";
                runOnUiThread(()->{pendingBytes=bytes;pendingFilename=clean;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(actualMime);i.putExtra(Intent.EXTRA_TITLE,clean);startActivityForResult(i,SAVE_DOCUMENT);});
            }catch(Exception ignored){}
        }
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==FILE_CHOOSER){if(fileCallback!=null)fileCallback.onReceiveValue(resultCode==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
        if(requestCode==SAVE_DOCUMENT){
            if(resultCode==RESULT_OK&&data!=null&&pendingBytes!=null){try(OutputStream os=getContentResolver().openOutputStream(data.getData())){if(os!=null){os.write(pendingBytes);Toast.makeText(this,"已保存："+pendingFilename,Toast.LENGTH_SHORT).show();}}catch(Exception e){Toast.makeText(this,"保存失败："+e.getMessage(),Toast.LENGTH_LONG).show();}}
            pendingBytes=null;
        }
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(requestCode,permissions,grants);
        if(requestCode==MIC_PERMISSION&&pendingPermission!=null){if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else pendingPermission.deny();pendingPermission=null;}
    }
    @Override public void onBackPressed(){
        if(web==null){super.onBackPressed();return;}
        // Respect in-app subpages first. WebView history alone cannot navigate JS-rendered pages.
        web.evaluateJavascript("(function(){try{return window.PipiNavigateBack?window.PipiNavigateBack():false}catch(e){return false}})()", value->{
            if("true".equals(value))return;
            if(web.canGoBack())web.goBack();else MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onResume() {
        super.onResume();
        // If Android reclaimed only the service while the app is still usable,
        // restore the user-requested job on returning to the foreground.
        // The synthesis service lives in :voice_cache. Its static in-memory flag
        // is not shared with this process; trust durable heartbeat instead.
        org.json.JSONObject cacheStatus;
        try { cacheStatus=new org.json.JSONObject(LibraryVoiceCacheService.Companion.status(getApplicationContext())); }
        catch (org.json.JSONException ex) { cacheStatus=null; }
        long lastBeat=cacheStatus!=null?cacheStatus.optLong("updatedAt",0L):0L;
        if (LibraryVoiceCacheService.shouldResume(getApplicationContext()) &&
            (lastBeat<=0L || System.currentTimeMillis()-lastBeat>70_000L)) {
            try {
                startForegroundService(new Intent(this, LibraryVoiceCacheService.class)
                    .setAction(LibraryVoiceCacheService.ACTION_RESTORE));
            } catch (Exception ignored) { /* The user can still resume via the cache page. */ }
        }
    }
    @Override protected void onPause() {
        resumeArticleAfterWord.set(false);
        if (voice != null) voice.stop();
        if (articleVoice != null) articleVoice.pause();
        super.onPause();
    }
    @Override protected void onDestroy(){
        if (voice != null) voice.close();
        if (articleVoice != null) articleVoice.close();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
