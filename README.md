# betterSnmpJs
A more full featured SNMP library than the alternatives. Suitable for building both clients and servers (managers).

## Quick Start
### Install
`$ npm install bettersnmpjs`
### Importing
```js
let SnmpServer = require('bettersnmpjs');
```
### Creating a server object
- Pass your SNMP configuration, and optionally, your SNMP Trap reception configuration as objects to the constructor.

```
snmpOptions     = { interface: , port: , timeoutRetries: , timeoutPeriod: , listener: } 
snmpTrapOptions = { interface: , port: , listener: }

const srv = new SnmpServer(snmpOptions, snmpTrapOptions);
```
SnmpServer sets defaults for all the above configuratio object properties. For snmpOptions the defaults are: _0.0.0.0, 161, 0, 5000, undefined_

### Running an SNMP command and using the results
```js
function snmpCb(err, results) {
    if( !err ) {
        console.log(JSON.stringify(results, null, 2)); // Raw results of completed Task (or a TaskId for submitImage calls)
    }
}
let oids = ['1.3.6.1.2.1.1.1.0']; // dcPwrSysRelayTable
let destination = { address: 'demo.snmplabs.com', port: 161 };
let snmpOptions = { version: 1, community: 'public' };

srv.getRequest(snmpOptions, destination, oids, tableCb);
```
 
  
   
## Documentation
### getRequest(options, destination, oids, callback)
- `[parameters]` `<Object>` Optional Abbyy API method parameters. Object with string properties.
- `uploadData` `<string>` or `<Buffer>` Image to be processed by API method.  
- `callback(err, results)` `<Function>` Callback to return `err`s or OCR `results`.


### getNextRequest(options, destination, oids, callback)
- `parameters` `<Object>` Abbyy API method parameters. A text field region must be specified. 
- `uploadData` `<string>` or `<Buffer>` File to be processed by API method.  
- `callback(err, results)` <Function> Callback to return `err`s or OCR `results`.
 
 
### walk(options, destination, oid, callback)
- `[parameters]` `<Object>` Optional Abbyy API method parameters.
- `uploadData` `<string>` or `<Buffer>` File to be uploaded to Abbyy server.  
- `callback(err, results)` `<Function>` Callback to return `err`s or Task ID string representing uploaded file.
 
 
### table(options, destination, oid, callback)
- `parameters` `<Object>` Abbyy API method parameters. Task ID corresponding to a file uploaded via submitImage is required.
- `callback(err, results)` `<Function>` Callback to return `err`s or OCR `results`.
 
  
### trap()
<in development>

      
