# @nordicid/nurapi-web — API Reference

> Generated: 2026-05-05 21:12:34 UTC  
> Package version: `0.9.3`  
> Source: TypeDoc

Browser transports for the `@nordicid/nurapi` library — Web Serial and Web Bluetooth.

## Overview

Browser transports for the `@nordicid/nurapi` library — Web Serial and Web Bluetooth.

```bash
npm install @nordicid/nurapi @nordicid/nurapi-web
```

Import the package to register `ser://` and `ble://` URI schemes automatically:

```typescript
import '@nordicid/nurapi-web';
import { NurApi } from '@nordicid/nurapi';

const reader = new NurApi();
await reader.connect('ser://request'); // or 'ble://request'
```

### Browser requirements

- **Chromium-only** — Chrome, Edge, Opera. Firefox and Safari do not support Web Serial or Web Bluetooth.
- **User gesture required** — `ser://request` and `ble://request` must be called from a click/tap handler.
- **Secure context (HTTPS)** — Web Serial and Web Bluetooth require HTTPS or `localhost`.

### Feature detection

Check API availability before connecting:

```typescript
import { isWebSerialSupported, isWebBluetoothSupported, getSupportedSchemes } from '@nordicid/nurapi-web';

if (isWebSerialSupported()) {
  await reader.connect('ser://request');
}

if (isWebBluetoothSupported()) {
  await reader.connect('ble://request');
}

// Returns ['ser', 'ble'] or a subset depending on browser support
const schemes = getSupportedSchemes();
```

### Transport registration

The import `@nordicid/nurapi-web` conditionally registers each scheme only if the browser supports the underlying API and the scheme is not already registered:

| Scheme | Browser API | Registered when |
|---|---|---|
| `ser://` | `navigator.serial` | Web Serial API available |
| `ble://` | `navigator.bluetooth` | Web Bluetooth API available |

## Web Serial

Connect to a NUR reader via the browser's Web Serial API (`navigator.serial`).

### Connecting

The only supported pattern is `ser://request`, which opens the browser's port picker dialog:

```typescript
import '@nordicid/nurapi-web';
import { NurApi } from '@nordicid/nurapi';

const reader = new NurApi();

// Must be called from a user gesture (click handler)
document.getElementById('connect-btn').addEventListener('click', async () => {
  await reader.connect('ser://request');
});
```

### Baud rate

The default baud rate is **115200**. Override with a query parameter:

```typescript
await reader.connect('ser://request?baudrate=230400');
```

Serial configuration is fixed at **8N1** (8 data bits, no parity, 1 stop bit).

## Web Bluetooth

Connect to a NUR reader via the browser's Web Bluetooth API using the Nordic UART Service (NUS).

### Connecting

```typescript
import '@nordicid/nurapi-web';
import { NurApi } from '@nordicid/nurapi';

const reader = new NurApi();

// Must be called from a user gesture (click handler)
document.getElementById('connect-btn').addEventListener('click', async () => {
  await reader.connect('ble://request'); // opens device picker
});
```

### URI patterns

| URI | Behaviour |
|---|---|
| `ble://request` | Opens the browser device picker filtered by NUS service |
| `ble://DeviceName` | Connects to a device matching the name prefix |

### BLE details

The transport uses the **Nordic UART Service (NUS)**:

| Characteristic | UUID | Direction |
|---|---|---|
| RX (device receives) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | Host → Reader |
| TX (device transmits) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | Reader → Host |

Write operations are automatically chunked to the BLE MTU size (200 bytes by default).

### GATT connection resilience

The transport includes automatic retry for GATT connection setup. Some BLE devices
need a brief stabilization period after the initial GATT connect before service
discovery succeeds. The transport retries up to 2 times with a 500ms delay between
attempts.

## API Reference

### @nordicid/nurapi-web

#### Utility

##### isWebSerialSupported()

> **isWebSerialSupported**(): `boolean`


Check if the Web Serial API is available in the current browser.

**Returns** `boolean`

***

##### isWebBluetoothSupported()

> **isWebBluetoothSupported**(): `boolean`


Check if the Web Bluetooth API is available in the current browser.

**Returns** `boolean`

***

##### getSupportedSchemes()

> **getSupportedSchemes**(): `string`[]


Get the list of transport URI schemes supported in the current browser.

**Returns** `string`[]

#### Transport

##### WebBluetoothTransport


Web Bluetooth API transport for NUR reader communication.

Uses the Nordic UART Service (NUS) for bidirectional binary data transfer.
Data received from the reader arrives via BLE notifications on the TX characteristic.
Data sent to the reader is written to the RX characteristic with MTU-aware chunking.

Includes automatic retry with stabilization delay for GATT connection setup,
which handles the common BLE issue where first service discovery fails.

###### Example

```typescript
import '@nordicid/nurapi-web';
await reader.connect('ble://request'); // prompts user to select a device
```

###### Implements

- `NurTransport`

###### Accessors

###### connected

###### Get Signature

> **get** **connected**(): `boolean`


Whether the transport is currently connected

**Returns** `boolean`

###### Constructors

###### Constructor

> **new WebBluetoothTransport**(): [`WebBluetoothTransport`](#webbluetoothtransport)

**Returns** [`WebBluetoothTransport`](#webbluetoothtransport)

###### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader via Web Bluetooth.

If uri.hostname is 'request', shows the browser device picker dialog.
Otherwise, filters devices by the hostname as a name prefix.

GATT connection includes automatic retry with stabilization delay to
handle the common BLE issue where first service discovery fails because
the reader's BLE stack is not ready immediately after accepting a connection.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | BLE URI (ble://request or ble://DeviceName) |

**Returns** `Promise`\<`void`\>

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the Bluetooth device.

**Returns** `Promise`\<`void`\>

###### write()

> **write**(`data`): `Promise`\<`void`\>


Send binary data to the reader via BLE.
Data is written to the NUS RX characteristic (device receives) with MTU chunking.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw packet bytes to send |

**Returns** `Promise`\<`void`\>

###### Properties

###### type

> `readonly` **type**: `"bluetooth"` = `'bluetooth'`


Human-readable transport type identifier (e.g., 'websocket', 'serial', 'tcp').

###### flags

> `readonly` **flags**: `PreferAck` = `NurTransportFlags.PreferAck`


Transport capability flags.

When `NurTransportFlags.PreferAck` is set, the connection layer sends
`HOSTFLAGS_EN_UNSOL_ACK` during the initial ping so the module includes
ACK requests with unsolicited packets.

Defaults to `NurTransportFlags.None` when not provided.

###### onData

> **onData**: ((`data`) => `void`) \| `null` = `null`


Callback for received data

###### onDisconnect

> **onDisconnect**: ((`error?`) => `void`) \| `null` = `null`


Callback for unexpected disconnection

***

##### WebSerialTransport


Web Serial API transport for NUR reader communication.

Uses the browser's native Web Serial API (navigator.serial).
Binary data is exchanged via ReadableStream/WritableStream on the serial port.

###### Example

```typescript
// Usually used via URI registration (automatic):
import '@nordicid/nurapi-web';
await reader.connect('ser://request'); // prompts user to select a port

// Connect to a previously remembered port:
await reader.connect('ser://');
```

###### Implements

- `NurTransport`

###### Accessors

###### connected

###### Get Signature

> **get** **connected**(): `boolean`


Whether the transport is currently connected

**Returns** `boolean`

###### Constructors

###### Constructor

> **new WebSerialTransport**(): [`WebSerialTransport`](#webserialtransport)

**Returns** [`WebSerialTransport`](#webserialtransport)

###### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader via Web Serial.

Shows the browser port picker dialog (requires user gesture).
Baud rate can be specified via ?baudrate= query parameter (default 115200).

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | Serial URI (ser://request?baudrate=115200) |

**Returns** `Promise`\<`void`\>

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the serial port.

**Returns** `Promise`\<`void`\>

###### write()

> **write**(`data`): `Promise`\<`void`\>


Send binary data to the reader via serial port.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw packet bytes to send |

**Returns** `Promise`\<`void`\>

###### Properties

###### type

> `readonly` **type**: `"serial"` = `'serial'`


Human-readable transport type identifier (e.g., 'websocket', 'serial', 'tcp').

###### flags

> `readonly` **flags**: `PreferAck` = `NurTransportFlags.PreferAck`


Transport capability flags.

When `NurTransportFlags.PreferAck` is set, the connection layer sends
`HOSTFLAGS_EN_UNSOL_ACK` during the initial ping so the module includes
ACK requests with unsolicited packets.

Defaults to `NurTransportFlags.None` when not provided.

###### onData

> **onData**: ((`data`) => `void`) \| `null` = `null`


Callback for received data

###### onDisconnect

> **onDisconnect**: ((`error?`) => `void`) \| `null` = `null`


Callback for unexpected disconnection
