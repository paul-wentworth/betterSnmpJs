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
Pass your SNMP configuration, and optionally, your SNMP Trap reception configuration as objects to the constructor.

```js
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
- `options` `<Object>` Object representing SNMP Options for the command. Contains a version number and community string. `let snmpOptions = { version: 1, community: 'public' };`
- `destination` `<Object>` Object representing destination. Contains an IP or URL string and a port number. `let destination = { address: 'URL or IP string', port: 161 };`
- `oids` `<Array>` Array of OID strings (without the leading decimal) to perform GETs on. 
- `callback(err, varbinds)` `<Function>` Callback function to process results. Returns either an error or varbinds representing the results of the GET Request.


### getNextRequest(options, destination, oids, callback)
 
 
### walk(options, destination, oid, callback)
- `oid` `<String>` A single OID string without the leading decimal. 

 
 
### table(options, destination, oid, callback)
- `oid` `<String>` A single OID string without the leading decimal. 
 
  
### trap()
<in development>

      
