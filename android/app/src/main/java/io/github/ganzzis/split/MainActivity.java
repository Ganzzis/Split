package io.github.ganzzis.split;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(SplitDocumentsPlugin.class);
        super.onCreate(state);
    }
}
