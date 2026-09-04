package br.com.rastro.rebanho

// ============================================================
// Núcleo Bluetooth do app Rebanho — cópia adaptada de
// ScaleConnectionManager.kt do app irmão "Rastro Trato Certo"
// (~/Documents/App Balanca Trato Vagao/android-native), que já passou
// pela mesma lição em produção: Bluetooth Classic SPP puro pra balanças
// (Saicon/Digi-Star) falhava com "read failed, socket might closed or
// timeout"; busca BLE direta no app (sem parear pelo Android) é o caminho
// que funciona de verdade. Aqui a mesma classe é reaproveitada pra dois
// tipos de equipamento: a balança (Tru-Test S3, BLE padrão) e o leitor
// RFID (Allflex RS420, que fala Bluetooth Classic SPP/iAP — o fallback
// connectBluetooth() existe pra ele, mas o formato real do frame ainda
// não foi validado com o hardware físico em mãos).
// ============================================================

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

enum class TipoEquipamento(val titulo: String) {
    BALANCA("balança"),
    BASTAO("bastão RFID"),
}

data class BleDispositivo(val name: String, val address: String, val signal: Int)

class BluetoothHardwareManager(
    private val context: Context,
    private val scope: CoroutineScope,
    private val tipo: TipoEquipamento,
    private val onFrame: (ByteArray) -> Unit,
    private val onStatus: (Boolean, String) -> Unit,
) {
    private var readJob: Job? = null
    private var bluetoothSocket: BluetoothSocket? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private val bleDeviceMap = linkedMapOf<String, BluetoothDevice>()
    private val bleNames = mutableMapOf<String, String>()
    private val bleSignals = mutableMapOf<String, Int>()
    private val _bleDevices = MutableStateFlow<List<BleDispositivo>>(emptyList())
    val bleDevices = _bleDevices.asStateFlow()
    private val pendingDescriptors = ArrayDeque<BluetoothGattDescriptor>()
    private var activeName = tipo.titulo
    private val framedBleBuffer = mutableListOf<Byte>()

    // Nomes conhecidos priorizados na lista de busca — inclui o hardware
    // real do Rebanho (Tru-Test S3, Allflex RS420) além de marcas comuns
    // do mercado, pra facilitar identificar o aparelho certo numa busca
    // que aceita qualquer dispositivo Bluetooth por perto.
    private val priorityNames: List<String> = when (tipo) {
        TipoEquipamento.BALANCA -> listOf(
            "COIMMA",
            "KM3",
            "TRU-TEST",
            "TRUTEST",
            "S3",
            "SN150",
            "SAICON",
            "DIGI",
            "TOPCON",
        )
        TipoEquipamento.BASTAO -> listOf("ALLFLEX", "RS420", "RFID", "LEITOR", "READER", "TAG", "HDX", "FDX")
    }
    private val buscaMensagem = when (tipo) {
        TipoEquipamento.BALANCA -> "Buscando balanças próximas…"
        TipoEquipamento.BASTAO -> "Buscando bastões RFID próximos…"
    }
    private val naoEncontradoMensagem = when (tipo) {
        TipoEquipamento.BALANCA -> "Nenhuma balança encontrada. Aproxime o celular e confirme que ela está ligada."
        TipoEquipamento.BASTAO -> "Nenhum bastão encontrado. Aproxime o celular e confirme que ele está ligado."
    }
    private val naoLocalizadoMensagem = when (tipo) {
        TipoEquipamento.BALANCA -> "Balança não encontrada. Faça uma nova busca."
        TipoEquipamento.BASTAO -> "Bastão não encontrado. Faça uma nova busca."
    }
    private val conectadoAdj = when (tipo) {
        TipoEquipamento.BALANCA -> "conectada"
        TipoEquipamento.BASTAO -> "conectado"
    }
    private val desconectadoAdj = when (tipo) {
        TipoEquipamento.BALANCA -> "desconectada"
        TipoEquipamento.BASTAO -> "desconectado"
    }

    private val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    @SuppressLint("MissingPermission")
    fun deviceName(device: BluetoothDevice): String =
        runCatching { device.name ?: device.address }.getOrDefault(device.address)

    private val scanCallback = object : ScanCallback() {
        @SuppressLint("MissingPermission")
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val name = runCatching { device.name }.getOrNull()
                ?: result.scanRecord?.deviceName
                ?: "Bluetooth sem nome"
            bleDeviceMap[device.address] = device
            bleNames[device.address] = name
            bleSignals[device.address] = result.rssi
            _bleDevices.value = bleDeviceMap.keys.map { address ->
                BleDispositivo(
                    name = bleNames[address] ?: "Bluetooth sem nome",
                    address = address,
                    signal = bleSignals[address] ?: -127,
                )
            }.sortedWith(
                compareByDescending<BleDispositivo> {
                    val n = it.name.uppercase()
                    priorityNames.any { nome -> n.contains(nome) }
                }.thenByDescending { it.signal },
            )
        }

        override fun onScanFailed(errorCode: Int) {
            onStatus(false, "Busca Bluetooth falhou (código $errorCode). Desligue e ligue o Bluetooth.")
        }
    }

    @SuppressLint("MissingPermission")
    fun startBleScan() {
        if (!canScanBluetooth()) {
            onStatus(false, "Permita a busca Bluetooth e toque em Buscar novamente.")
            return
        }
        bleDeviceMap.clear()
        bleNames.clear()
        bleSignals.clear()
        _bleDevices.value = emptyList()
        adapter?.bluetoothLeScanner?.startScan(scanCallback)
        onStatus(false, buscaMensagem)
        scope.launch {
            delay(12_000)
            stopBleScan()
            if (_bleDevices.value.isEmpty()) {
                onStatus(false, naoEncontradoMensagem)
            }
        }
    }

    // O Allflex RS420 normalmente aparece como Bluetooth Classic SPP,
    // não como BLE. Ele precisa estar pareado nas configurações do
    // Android; depois incluímos os pareados na mesma lista mostrada pelo
    // app, para o operador poder selecioná-lo normalmente.
    @SuppressLint("MissingPermission")
    fun includePairedClassicDevices() {
        if (!canUseBluetooth()) return
        pairedDevices().forEach { device ->
            val name = deviceName(device)
            bleDeviceMap[device.address] = device
            bleNames[device.address] = "$name (pareado)"
            bleSignals[device.address] = 0
        }
        publicarDispositivos()
    }

    private fun publicarDispositivos() {
        _bleDevices.value = bleDeviceMap.keys.map { address ->
            BleDispositivo(
                name = bleNames[address] ?: "Bluetooth sem nome",
                address = address,
                signal = bleSignals[address] ?: -127,
            )
        }.sortedWith(
            compareByDescending<BleDispositivo> {
                val n = it.name.uppercase()
                priorityNames.any { nome -> n.contains(nome) }
            }.thenByDescending { it.signal },
        )
    }

    @SuppressLint("MissingPermission")
    fun stopBleScan() {
        if (canScanBluetooth()) runCatching { adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    }

    @SuppressLint("MissingPermission")
    fun connectBle(address: String) {
        val device = bleDeviceMap[address] ?: runCatching { adapter?.getRemoteDevice(address) }.getOrNull()
        if (device == null) {
            onStatus(false, naoLocalizadoMensagem)
            return
        }
        stopBleScan()
        disconnect(closeScan = false)
        activeName = bleNames[address] ?: deviceName(device)
        framedBleBuffer.clear()
        onStatus(false, "Conectando a $activeName sem pareamento…")
        bluetoothGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        } else {
            device.connectGatt(context, false, gattCallback)
        }
    }

    @SuppressLint("MissingPermission")
    fun connectPreferred(address: String) {
        val paired = pairedDevices().firstOrNull { it.address == address }
        if (tipo == TipoEquipamento.BASTAO && paired != null) {
            connectClassic(paired)
        } else {
            connectBle(address)
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    bluetoothGatt = gatt
                    onStatus(false, "$activeName $conectadoAdj. Identificando os canais…")
                    gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    onStatus(
                        false,
                        if (status == BluetoothGatt.GATT_SUCCESS) {
                            "$activeName $desconectadoAdj."
                        } else {
                            "$activeName recusou a conexão Bluetooth (código $status)."
                        },
                    )
                    runCatching { gatt.close() }
                    if (bluetoothGatt == gatt) bluetoothGatt = null
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                onStatus(false, "Conectou, mas não foi possível ler os canais do $activeName (código $status).")
                return
            }
            pendingDescriptors.clear()
            var notifications = 0
            gatt.services.flatMap(BluetoothGattService::getCharacteristics).forEach { characteristic ->
                val properties = characteristic.properties
                val notify = properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0
                val indicate = properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0
                if ((notify || indicate) && gatt.setCharacteristicNotification(characteristic, true)) {
                    characteristic.getDescriptor(CCCD_UUID)?.let { descriptor ->
                        descriptor.value = if (indicate) {
                            BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                        } else {
                            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        }
                        pendingDescriptors.add(descriptor)
                        notifications++
                    }
                }
            }
            writeNextDescriptor(gatt)
            val nomesServicos = gatt.services.joinToString(", ") { it.uuid.toString() }
            onStatus(
                notifications > 0,
                if (notifications > 0) {
                    "$activeName $conectadoAdj: $notifications canal(is) ativado(s)."
                } else {
                    "$activeName $conectadoAdj, mas sem canal automático. Serviços: $nomesServicos"
                },
            )
        }

        @Deprecated("Compatibilidade com Android 12 e anteriores")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            handleBleValue(characteristic.value ?: byteArrayOf())
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            handleBleValue(value)
        }

        @Deprecated("Compatibilidade com Android 12 e anteriores")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) handleBleValue(characteristic.value ?: byteArrayOf())
        }

        @SuppressLint("MissingPermission")
        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            writeNextDescriptor(gatt)
        }
    }

    private fun handleBleValue(value: ByteArray) {
        if (value.isEmpty()) return

        // A Coimma KM3-N usa um canal serial BLE. Cada leitura tem 26 bytes,
        // delimitados por STX (0x02) e ETX (0x03), mas o MTU do equipamento
        // divide o quadro em duas notificações (20 + 6 bytes). Entregar cada
        // pedaço isolado ao JavaScript fazia o primeiro pedaço ser confundido
        // com uma medição padrão e gerava um peso incorreto. Remontamos apenas
        // os equipamentos Coimma/KM3; a Tru-Test S3 continua recebendo cada
        // notificação padrão sem qualquer alteração.
        if (!usaQuadroSerialCoimma()) {
            onFrame(value)
            return
        }

        val inicio = value.indexOfLast { it == STX }
        if (inicio >= 0) {
            // Um novo STX invalida qualquer quadro anterior que tenha ficado
            // incompleto depois de uma perda momentânea de sinal.
            framedBleBuffer.clear()
            value.copyOfRange(inicio, value.size).forEach(framedBleBuffer::add)
        } else if (framedBleBuffer.isNotEmpty()) {
            value.forEach(framedBleBuffer::add)
        } else {
            return
        }

        if (framedBleBuffer.size > MAX_SERIAL_FRAME_SIZE) {
            framedBleBuffer.clear()
            return
        }

        // O checksum (penúltimo byte) pode coincidir numericamente com ETX.
        // Por isso usamos o tamanho fixo observado do protocolo, em vez de
        // encerrar no primeiro byte 0x03 encontrado.
        while (framedBleBuffer.size >= COIMMA_FRAME_SIZE) {
            if (framedBleBuffer.first() != STX) {
                framedBleBuffer.removeAt(0)
                continue
            }
            if (framedBleBuffer[COIMMA_FRAME_SIZE - 1] != ETX) {
                framedBleBuffer.removeAt(0)
                continue
            }
            val quadro = ByteArray(COIMMA_FRAME_SIZE) { indice -> framedBleBuffer[indice] }
            framedBleBuffer.subList(0, COIMMA_FRAME_SIZE).clear()
            onFrame(quadro)
        }
    }

    private fun usaQuadroSerialCoimma(): Boolean {
        if (tipo != TipoEquipamento.BALANCA) return false
        val nome = activeName.uppercase()
        return nome.contains("COIMMA") || nome.contains("KM3")
    }

    @SuppressLint("MissingPermission")
    private fun writeNextDescriptor(gatt: BluetoothGatt) {
        val descriptor = pendingDescriptors.removeFirstOrNull() ?: return
        if (Build.VERSION.SDK_INT >= 33) {
            gatt.writeDescriptor(descriptor, descriptor.value)
        } else {
            @Suppress("DEPRECATION")
            gatt.writeDescriptor(descriptor)
        }
    }

    // Fallback pro Allflex RS420 (Bluetooth Classic SPP) — precisa do
    // aparelho já pareado nas configurações de Bluetooth do Android antes
    // (diferente do connectBle, que não exige pareamento prévio). O
    // formato exato do frame ainda não foi validado com hardware real.
    @SuppressLint("MissingPermission")
    fun connectClassic(device: BluetoothDevice) {
        disconnect()
        activeName = deviceName(device)
        onStatus(false, "Conectando a $activeName pelo modo serial clássico (SPP)…")
        readJob = scope.launch(Dispatchers.IO) {
            adapter?.cancelDiscovery()
            var ultimoErro: Throwable? = null
            val socket = candidatosSocketClassico(device).firstNotNullOfOrNull { criarSocket ->
                runCatching { criarSocket().also { it.connect() } }
                    .onFailure { ultimoErro = it }
                    .getOrNull()
            }
            if (socket == null) {
                onStatus(false, "A porta serial foi recusada por $activeName (${ultimoErro?.message ?: "sem detalhe"}).")
                return@launch
            }
            runCatching {
                bluetoothSocket = socket
                onStatus(true, "$activeName conectado pelo modo serial.")
                readLoop(socket.inputStream)
            }.onFailure {
                onStatus(false, "A porta serial foi recusada por $activeName (${it.message ?: "sem detalhe"}).")
            }
        }
    }

    // Leitores/módulos seriais Bluetooth baratos (é o caso deste bastão)
    // costumam não responder direito à busca SDP que
    // createRfcommSocketToServiceRecord faz pra descobrir o canal —
    // derruba a conexão de cara com "read failed, socket might closed or
    // timeout" (mesmo erro clássico já visto antes com balanças Bluetooth
    // Classic sem registro SDP correto). O contorno é abrir o canal
    // RFCOMM direto pelo número, pulando a busca SDP inteira — a API
    // pública não expõe isso, só via reflection (`createRfcommSocket`,
    // método interno do BluetoothDevice). Tenta o modo padrão primeiro
    // e, se falhar, os canais mais comuns usados por esses módulos.
    private fun candidatosSocketClassico(device: BluetoothDevice): List<() -> BluetoothSocket> {
        val porServico: () -> BluetoothSocket = { device.createRfcommSocketToServiceRecord(SPP_UUID) }
        val porCanal: (Int) -> () -> BluetoothSocket = { canal ->
            {
                val metodo = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                metodo.invoke(device, canal) as BluetoothSocket
            }
        }
        return listOf(porServico) + (1..4).map(porCanal)
    }

    fun pairedDevices(): List<BluetoothDevice> {
        if (!canUseBluetooth()) return emptyList()
        return runCatching { adapter?.bondedDevices?.sortedBy { deviceName(it) }?.toList() ?: emptyList() }
            .getOrDefault(emptyList())
    }

    private suspend fun readLoop(input: java.io.InputStream) {
        val buffer = ByteArray(512)
        while (scope.isActive) {
            val count = input.read(buffer)
            if (count < 0) break
            if (count > 0) onFrame(buffer.copyOf(count))
        }
        onStatus(false, "Conexão serial encerrada.")
    }

    fun disconnect(closeScan: Boolean = true) {
        if (closeScan) stopBleScan()
        readJob?.cancel()
        runCatching { bluetoothSocket?.close() }
        runCatching { bluetoothGatt?.disconnect() }
        runCatching { bluetoothGatt?.close() }
        bluetoothSocket = null
        bluetoothGatt = null
        framedBleBuffer.clear()
    }

    fun canUseBluetooth(): Boolean =
        Build.VERSION.SDK_INT < 31 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    fun canScanBluetooth(): Boolean =
        canUseBluetooth() &&
            (Build.VERSION.SDK_INT >= 31 ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED)

    companion object {
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805F9B34FB")
        private const val STX: Byte = 0x02
        private const val ETX: Byte = 0x03
        private const val COIMMA_FRAME_SIZE = 26
        private const val MAX_SERIAL_FRAME_SIZE = 512
    }
}
