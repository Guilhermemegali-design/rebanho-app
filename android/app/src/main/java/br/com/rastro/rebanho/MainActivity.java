package br.com.rastro.rebanho;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RebanhoHardwarePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
