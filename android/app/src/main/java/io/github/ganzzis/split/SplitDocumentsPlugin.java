package io.github.ganzzis.split;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** System document providers, scoped URI grants only: no storage permissions. */
@CapacitorPlugin(name = "SplitDocuments")
public class SplitDocumentsPlugin extends Plugin {
    private static final int MAX = 10 * 1024 * 1024;
    private boolean pending;

    @PluginMethod public void importJSON(PluginCall call) {
        if (pending) { call.reject("Document picker is already open"); return; }
        pending = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
        try { startActivityForResult(call, intent, "importResult"); }
        catch (Exception e) { pending = false; call.reject("Document picker unavailable", e); }
    }
    @ActivityCallback private void importResult(PluginCall call, ActivityResult result) {
        pending = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject().put("cancelled", true)); return; }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("No document URI"); return; }
        getBridge().execute(() -> {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new IOException("No stream");
            byte[] buffer = new byte[8192]; int count;
            while ((count = in.read(buffer)) != -1) {
                if (out.size() + count > MAX) throw new IOException("File exceeds 10 MB");
                out.write(buffer, 0, count);
            }
            call.resolve(new JSObject().put("raw", out.toString(StandardCharsets.UTF_8.name())));
        } catch (Exception e) { call.reject("Unable to read JSON", e); }
        });
    }
    @PluginMethod public void exportJSON(PluginCall call) {
        if (pending) { call.reject("Document picker is already open"); return; }
        String raw = call.getString("raw");
        if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > MAX) { call.reject("Invalid JSON size"); return; }
        pending = true;
        String name = call.getString("name", "split-history.json");
        if (!name.matches("[A-Za-z0-9_-]+\\.json")) name = "split-history.json";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/json"); intent.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(call, intent, "exportResult"); }
        catch (Exception e) { pending = false; call.reject("Document picker unavailable", e); }
    }
    @ActivityCallback private void exportResult(PluginCall call, ActivityResult result) {
        pending = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.resolve(new JSObject().put("cancelled", true)); return; }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("No document URI"); return; }
        getBridge().execute(() -> {
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new IOException("No stream");
            out.write(call.getString("raw", "").getBytes(StandardCharsets.UTF_8)); out.flush();
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception e) { call.reject("Unable to write JSON", e); }
        });
    }
}
