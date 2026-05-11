# @nordicid/nurapi-node — API Reference

> Generated: 2026-05-11 18:30:18 UTC  
> Package version: `0.9.8`  
> Source: TypeDoc

Node.js transports for the `@nordicid/nurapi` library — serial port (`serialport`) and TCP socket.

## Overview

Node.js transports for the `@nordicid/nurapi` library — serial port (`serialport`) and TCP socket.

```bash
npm install @nordicid/nurapi @nordicid/nurapi-node
```

Import the package to register `ser://` and `tcp://` URI schemes automatically:

```typescript
import '@nordicid/nurapi-node';
import { NurApi } from '@nordicid/nurapi';

const reader = new NurApi();
await reader.connect('ser:///dev/ttyUSB0');  // Linux serial
// await reader.connect('ser://COM3');       // Windows serial
// await reader.connect('tcp://192.168.1.100'); // TCP
```

### Transport registration

The import `@nordicid/nurapi-node` registers transports and device discoverers:

| Scheme | Transport | Discovery |
|---|---|---|
| `ser://` | Serial port (`serialport`) | USB VID/PID enumeration |
| `tcp://` | TCP socket (`net.Socket`) | mDNS (`_nur._tcp.local`) |

### Dependencies

| Package | Purpose |
|---|---|
| `serialport` (≥13.0) | Serial port I/O and enumeration |
| `multicast-dns` (≥7.2) | mDNS device discovery for TCP readers |

Node.js **18.17+** required (serialport native addon constraint).

## Serial Port

Connect to a NUR reader via a local serial port using the `serialport` npm package.

### URI patterns

| URI | Platform | Example |
|---|---|---|
| `ser://COM3` | Windows | COM port (auto-uppercased) |
| `ser:///dev/ttyUSB0` | Linux | USB-to-serial adapter |
| `ser:///dev/ttyACM0` | Linux | USB CDC ACM device |
| `ser:///dev/cu.usbserial-*` | macOS | USB serial device |

### Baud rate

The default baud rate is **115200**. Override with a query parameter:

```typescript
await reader.connect('ser:///dev/ttyUSB0?baudrate=230400');
```

Serial configuration is fixed at **8N1** (8 data bits, no parity, 1 stop bit).

### Connection timeout

The transport waits up to **10 seconds** for the serial port to open. If the port
is not available or fails to open within this window, the connection is rejected.

## TCP Socket

Connect to a NUR reader over the network using a TCP socket (`net.Socket`).

### URI patterns

```typescript
await reader.connect('tcp://192.168.1.100');       // default port 4333
await reader.connect('tcp://192.168.1.100:4000');  // custom port
```

The default TCP port is **4333**, matching the NUR reader firmware default.

### Connection behaviour

- **TCP NoDelay** is enabled for low-latency command/response cycles.
- **10-second connect timeout** — rejected if the reader does not respond within this window.

## Device Discovery

The `@nordicid/nurapi-node` package provides automatic device discovery for both
serial and TCP readers.

### Usage

```typescript
import '@nordicid/nurapi-node';
import { NurDeviceDiscovery } from '@nordicid/nurapi';

const discovery = new NurDeviceDiscovery();

discovery.on('deviceDiscovery', (device) => {
  console.log(`${device.visible ? 'Found' : 'Lost'}: ${device.uri} (${device.name})`);
  // device.uri → 'ser://COM3' or 'tcp://192.168.1.42:4333'
  // device.visible → true when found, false when lost
});

discovery.start();

// Optionally filter by scheme:
// discovery.start({ schemes: ['ser'] });   // serial only
// discovery.start({ schemes: ['tcp'] });   // TCP/mDNS only
```

### Serial discovery

Enumerates USB serial ports and filters by known Nordic ID vendor/product IDs.

Recognised USB identifiers:

| Vendor ID | Product ID | Description |
|---|---|---|
| `04E6` | `0112` | Nordic ID reader (primary) |
| `0E05` | `0911` | Nordic ID reader (alternate) |
| `0403` | `6015` | FTDI chip (high-speed variant) |

FTDI-based readers automatically get `?baudrate=1000000` appended to the URI for
high-speed communication.

To include all serial ports (not just Nordic ID devices):

```typescript
import { SerialDeviceDiscovery } from '@nordicid/nurapi-node';

const discovery = new SerialDeviceDiscovery({ filterByVidPid: false });
```

### mDNS discovery

Discovers TCP readers advertising the `_nur._tcp.local` mDNS service.

The discovered URI includes metadata from the DNS TXT record:

```
tcp://192.168.1.42:4333?hostname=nur-reader-01.local&name=nur-reader-01&connstat=online&conntype=WiFi
```

The default TCP port **4333** is used if the SRV record does not specify a port.

## API Reference

### @nordicid/nurapi-node

Node.js transports for the [`@nordicid/nurapi`](https://www.npmjs.com/package/@nordicid/nurapi) library — serial port and TCP socket.

#### Install

```bash
npm install @nordicid/nurapi @nordicid/nurapi-node
```

#### Quick Start

Import the package to register `ser://` and `tcp://` URI schemes automatically:

```typescript
import '@nordicid/nurapi-node';
import { NurApi } from '@nordicid/nurapi';

const reader = new NurApi();
await reader.connect('ser:///dev/ttyUSB0');    // Linux serial
// await reader.connect('ser://COM3');          // Windows serial
// await reader.connect('tcp://192.168.1.100'); // TCP (default port 4333)
```

#### Transport Registration

| Scheme | Transport | Discovery |
|---|---|---|
| `ser://` | Serial port (`serialport`) | USB VID/PID enumeration |
| `tcp://` | TCP socket (`net.Socket`) | mDNS (`_nur._tcp.local`) |

#### Dependencies

| Package | Purpose |
|---|---|
| `serialport` (≥13.0) | Serial port I/O and enumeration |
| `multicast-dns` (≥7.2) | mDNS device discovery for TCP readers |

Node.js **18.17+** required.

#### Documentation

See the full API reference and guides at [nordicid.github.io/nur_nurapi_typescript](https://nordicid.github.io/nur_nurapi_typescript/).

#### License

See [LICENSE](https://nordicid.github.io/nur_nurapi_typescript/LICENSE).

#### Transport

##### NodeSerialTransport


Node.js serial port transport for NUR reader communication.

Serial configuration: 8 data bits, no parity, 1 stop bit (8N1).

###### Example

```typescript
import '@nordicid/nurapi-node';
await reader.connect('ser://COM3?baudrate=115200');
// Linux:
await reader.connect('ser:///dev/ttyUSB0');
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

> **new NodeSerialTransport**(): [`NodeSerialTransport`](#nodeserialtransport)

**Returns** [`NodeSerialTransport`](#nodeserialtransport)

###### Methods

###### getPortPath()

> `static` **getPortPath**(`uri`): `string`


Extract the serial port path from a URI.

- ser://COM3 → 'COM3' (hostname, uppercased for Windows)
- ser:///dev/ttyUSB0 → '/dev/ttyUSB0' (pathname)

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` |  |

**Returns** `string`

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader via serial port.
Times out after 10 seconds if the port cannot be opened.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | Serial URI (ser://COM3 or ser:///dev/ttyUSB0) |

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

***

##### TcpSocketTransport


TCP socket transport for NUR reader communication.

Uses Node.js native `net.Socket` with NoDelay enabled for low-latency
command/response cycles.

###### Example

```typescript
import '@nordicid/nurapi-node';
await reader.connect('tcp://192.168.1.100');     // default port 4333
await reader.connect('tcp://192.168.1.100:4333');
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

> **new TcpSocketTransport**(): [`TcpSocketTransport`](#tcpsockettransport)

**Returns** [`TcpSocketTransport`](#tcpsockettransport)

###### Methods

###### connect()

> **connect**(`uri`): `Promise`\<`void`\>


Connect to a NUR reader via TCP socket.
Times out after 10 seconds if the connection cannot be established.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| uri | `URL` | TCP URI (tcp://host:port) |

**Returns** `Promise`\<`void`\>

###### disconnect()

> **disconnect**(): `Promise`\<`void`\>


Disconnect from the TCP socket.

**Returns** `Promise`\<`void`\>

###### write()

> **write**(`data`): `Promise`\<`void`\>


Send binary data to the reader via TCP socket.

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| data | `Uint8Array` | Raw packet bytes to send |

**Returns** `Promise`\<`void`\>

###### Properties

###### type

> `readonly` **type**: `"tcp"` = `'tcp'`


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

##### PortInfo


Information about a serial port.

###### Properties

###### path

> **path**: `string`


System path (e.g., 'COM3', '/dev/ttyUSB0')

###### manufacturer?

> `optional` **manufacturer?**: `string`


Manufacturer name, if available

###### serialNumber?

> `optional` **serialNumber?**: `string`


Serial number, if available

###### vendorId?

> `optional` **vendorId?**: `string`


USB vendor ID, if available

###### productId?

> `optional` **productId?**: `string`


USB product ID, if available

***

##### listSerialPorts()

> **listSerialPorts**(): `Promise`\<[`PortInfo`](#portinfo)[]\>


List available serial ports on the system.

Uses the `serialport` package's `SerialPort.list()` API.

**Returns** `Promise`\<[`PortInfo`](#portinfo)[]\>

#### Other

##### MdnsFactory

> **MdnsFactory** = () => `MulticastDNS.MulticastDNS`


Factory function that creates an mDNS instance.

**Returns** `MulticastDNS.MulticastDNS`

***

##### MdnsDiscoveryOptions


Options for MdnsDeviceDiscovery.

###### Properties

###### mdnsFactory?

> `optional` **mdnsFactory?**: [`MdnsFactory`](#mdnsfactory)


Override the mDNS factory (for testing).

***

##### MdnsDeviceDiscovery


Discovers NUR RFID readers via mDNS (multicast DNS).

Sends periodic PTR queries for `_nur._tcp.local` and parses
the SRV + A + TXT responses to build `tcp://` URIs.

###### Implements

- `INurDeviceDiscovery`

###### Accessors

###### isActive

###### Get Signature

> **get** **isActive**(): `boolean`


Whether this discoverer is currently active.

**Returns** `boolean`

###### Constructors

###### Constructor

> **new MdnsDeviceDiscovery**(`options?`): [`MdnsDeviceDiscovery`](#mdnsdevicediscovery)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| options? | [`MdnsDiscoveryOptions`](#mdnsdiscoveryoptions) |  |

**Returns** [`MdnsDeviceDiscovery`](#mdnsdevicediscovery)

###### Methods

###### start()

> **start**(): `void`


Start discovering devices.

**Returns** `void`

###### stop()

> **stop**(): `void`


Stop discovering devices.

**Returns** `void`

###### periodicCheck()

> **periodicCheck**(): `void`


Called periodically by the orchestrator to poll for devices.

**Returns** `void`

###### Properties

###### scheme

> `readonly` **scheme**: `"tcp"` = `'tcp'`


URI scheme this discoverer handles (e.g., 'ser', 'tcp')

###### onDeviceDiscovery

> **onDeviceDiscovery**: `DeviceDiscoveryCallback` \| `null` = `null`


Callback for reporting discovered/lost devices to the orchestrator.

***

##### SerialDiscoveryOptions


Options for SerialDeviceDiscovery.

###### Properties

###### filterByVidPid?

> `optional` **filterByVidPid?**: `boolean`


Filter by Nordic ID VID/PID (default: true). Set false to report all serial ports.

***

##### SerialDeviceDiscovery


Discovers NUR RFID readers on serial/USB ports.

On each `periodicCheck()`, enumerates serial ports and reports
matched ports as `ser://` URIs.

###### Implements

- `INurDeviceDiscovery`

###### Accessors

###### isActive

###### Get Signature

> **get** **isActive**(): `boolean`


Whether this discoverer is currently active.

**Returns** `boolean`

###### Constructors

###### Constructor

> **new SerialDeviceDiscovery**(`options?`): [`SerialDeviceDiscovery`](#serialdevicediscovery)


**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| options? | [`SerialDiscoveryOptions`](#serialdiscoveryoptions) |  |

**Returns** [`SerialDeviceDiscovery`](#serialdevicediscovery)

###### Methods

###### start()

> **start**(): `void`


Start discovering devices.

**Returns** `void`

###### stop()

> **stop**(): `void`


Stop discovering devices.

**Returns** `void`

###### periodicCheck()

> **periodicCheck**(): `Promise`\<`void`\>


Called periodically by the orchestrator to poll for devices.

**Returns** `Promise`\<`void`\>

###### Properties

###### scheme

> `readonly` **scheme**: `"ser"` = `'ser'`


URI scheme this discoverer handles (e.g., 'ser', 'tcp')

###### onDeviceDiscovery

> **onDeviceDiscovery**: `DeviceDiscoveryCallback` \| `null` = `null`


Callback for reporting discovered/lost devices to the orchestrator.
