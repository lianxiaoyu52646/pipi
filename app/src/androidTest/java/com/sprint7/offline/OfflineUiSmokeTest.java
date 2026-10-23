package com.sprint7.offline;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Read-only instrumentation: never modifies/deletes the user's study database. */
@RunWith(AndroidJUnit4.class)
public class OfflineUiSmokeTest {
    private String js(ActivityScenario<MainActivity> scenario,String expression)throws Exception{
        CountDownLatch completed=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>("null");
        scenario.onActivity(activity->{android.view.ViewGroup root=activity.findViewById(android.R.id.content);
            android.view.View candidate=root.getChildAt(0);
            WebView browser=candidate instanceof WebView?(WebView)candidate:null;
            // Root content is a WebView; do not rely on private Activity fields.
            if(browser==null){completed.countDown();return;}
            browser.evaluateJavascript(expression,value->{result.set(value);completed.countDown();});
        });
        assertTrue("WebView JS timed out",completed.await(12,TimeUnit.SECONDS));
        return result.get();
    }
    @Test public void offlineHomeAndReviewTabRender()throws Exception{
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            Thread.sleep(1800); // bundled HTML/JS initial load, without network
            String hasApp=js(scenario,"(function(){return typeof PipiReviewLogic==='object' && !!document.querySelector('#bottomNav')})()");
            assertEquals("true",hasApp);
            String review=js(scenario,"(function(){var b=document.querySelector('[data-page=review]');if(!b)return false;b.click();return !!document.querySelector('.v5-review-filters')})()");
            assertEquals("true",review);
            String search=js(scenario,"(function(){var t=document.querySelector('#v5Search');return !!t && !t.disabled})()");
            assertEquals("true",search);
        }
    }
}
