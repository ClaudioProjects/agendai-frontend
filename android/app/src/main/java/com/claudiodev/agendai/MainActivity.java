package com.claudiodev.agendai;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(AlarmSchedulerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
