package br.com.rastro.rebanho

// ============================================================
// Plugin Capacitor que expõe o BluetoothHardwareManager pro JS do app
// web (lib/bluetoothScale.js / lib/rfid.js, em modo nativo). Cada busca
// (balança/bastão) usa sua própria instância do manager, com estado
// independente.
//
// Eventos emitidos pro JS via notifyListeners:
// - "bluetoothStatus": { tipo, conectado, mensagem }
// - "bluetoothFrame": { tipo, base64 } — bytes brutos da leitura; a
//   decodificação (peso ou brinco) fica a cargo do JS, que já tem a lógica
//   de decodificarPeso() e ainda não sabe o formato real do frame do
//   RS420 (ver handoff.md do Rebanho).
// - "bluetoothDevices": { tipo, dispositivos: [{ nome, endereco, sinal }] }
// ============================================================

import android.Manifest
import android.os.Build
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@CapacitorPlugin(
    name = "RebanhoHardware",
    permissions = [
        Permission(
            strings = [
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            ],
            alias = "bluetoothModerno",
        ),
        Permission(
            strings = [Manifest.permission.ACCESS_FINE_LOCATION],
            alias = "bluetoothLegado",
        ),
    ],
)
class RebanhoHardwarePlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var balanca: BluetoothHardwareManager? = null
    private var bastao: BluetoothHardwareManager? = null

    private fun managerPara(tipo: TipoEquipamento): BluetoothHardwareManager {
        val existente = if (tipo == TipoEquipamento.BALANCA) balanca else bastao
        if (existente != null) return existente
        val criado = BluetoothHardwareManager(
            context = context,
            scope = scope,
            tipo = tipo,
            onFrame = { bytes -> emitirFrame(tipo, bytes) },
            onStatus = { conectado, mensagem -> emitirStatus(tipo, conectado, mensagem) },
        )
        if (tipo == TipoEquipamento.BALANCA) balanca = criado else bastao = criado
        return criado
    }

    private fun emitirStatus(tipo: TipoEquipamento, conectado: Boolean, mensagem: String) {
        val data = JSObject()
        data.put("tipo", tipo.name)
        data.put("conectado", conectado)
        data.put("mensagem", mensagem)
        notifyListeners("bluetoothStatus", data)
    }

    private fun emitirFrame(tipo: TipoEquipamento, bytes: ByteArray) {
        val data = JSObject()
        data.put("tipo", tipo.name)
        data.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        notifyListeners("bluetoothFrame", data)
    }

    private fun emitirDispositivos(tipo: TipoEquipamento, manager: BluetoothHardwareManager) {
        val lista = JSArray()
        manager.bleDevices.value.forEach { dispositivo ->
            val item = JSObject()
            item.put("nome", dispositivo.name)
            item.put("endereco", dispositivo.address)
            item.put("sinal", dispositivo.signal)
            lista.put(item)
        }
        val data = JSObject()
        data.put("tipo", tipo.name)
        data.put("dispositivos", lista)
        notifyListeners("bluetoothDevices", data)
    }

    private fun iniciarBusca(tipo: TipoEquipamento, call: PluginCall) {
        val manager = managerPara(tipo)
        manager.startBleScan()
        if (tipo == TipoEquipamento.BASTAO) {
            manager.includePairedClassicDevices()
        }
        scope.launch {
            // Espelha a lista de dispositivos encontrados periodicamente
            // enquanto a busca (12s, definida no manager) estiver ativa.
            repeat(13) {
                kotlinx.coroutines.delay(1_000)
                emitirDispositivos(tipo, manager)
            }
        }
        call.resolve()
    }

    private fun aliasPermissaoBluetooth(): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetoothModerno" else "bluetoothLegado"

    private fun bluetoothPermitido(): Boolean =
        getPermissionState(aliasPermissaoBluetooth()) == com.getcapacitor.PermissionState.GRANTED

    @PluginMethod
    fun buscarBalanca(call: PluginCall) {
        if (!bluetoothPermitido()) {
            requestPermissionForAlias(aliasPermissaoBluetooth(), call, "onPermissaoBalanca")
            return
        }
        iniciarBusca(TipoEquipamento.BALANCA, call)
    }

    @PermissionCallback
    private fun onPermissaoBalanca(call: PluginCall) {
        if (bluetoothPermitido()) {
            iniciarBusca(TipoEquipamento.BALANCA, call)
        } else {
            call.reject("Permissão de Bluetooth negada.")
        }
    }

    @PluginMethod
    fun buscarBastao(call: PluginCall) {
        if (!bluetoothPermitido()) {
            requestPermissionForAlias(aliasPermissaoBluetooth(), call, "onPermissaoBastao")
            return
        }
        iniciarBusca(TipoEquipamento.BASTAO, call)
    }

    @PermissionCallback
    private fun onPermissaoBastao(call: PluginCall) {
        if (bluetoothPermitido()) {
            iniciarBusca(TipoEquipamento.BASTAO, call)
        } else {
            call.reject("Permissão de Bluetooth negada.")
        }
    }

    @PluginMethod
    fun conectar(call: PluginCall) {
        val tipoStr = call.getString("tipo") ?: return call.reject("Informe o tipo (BALANCA ou BASTAO).")
        val endereco = call.getString("endereco") ?: return call.reject("Informe o endereço do aparelho.")
        val tipo = runCatching { TipoEquipamento.valueOf(tipoStr) }.getOrNull()
            ?: return call.reject("Tipo inválido: $tipoStr")
        managerPara(tipo).connectPreferred(endereco)
        call.resolve()
    }

    @PluginMethod
    fun desconectar(call: PluginCall) {
        val tipoStr = call.getString("tipo")
        if (tipoStr == null) {
            balanca?.disconnect()
            bastao?.disconnect()
        } else {
            val tipo = runCatching { TipoEquipamento.valueOf(tipoStr) }.getOrNull()
            if (tipo == TipoEquipamento.BALANCA) balanca?.disconnect() else bastao?.disconnect()
        }
        call.resolve()
    }
}
