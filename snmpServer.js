const dgram = require ('dgram');
const snmpLib = require('./snmpLibrary'); 

class snmpServer 
{
    /* Constructor( snmpOptions, [snmpTrapOptions] ) 
	   snmpOptions     = { interface: , port: , timeoutRetries: , timeoutPeriod: , listener: } 
	   snmpTrapOptions = { interface: , port: , listener: }
	*/ 
    constructor(snmpOptions, snmpTrapOptions)
    {
        this.reqs = new snmpLib.requestDatabase(); 
        this.sendCount = 0; // [dbg] 
        this.recvCount = 0; 
        this.tmtCount = 0; 
        this.sendFailCount = 0; 
        this.recvAfterTimeout = 0; 

        /* Configure SNMP Socket */
        this.if         = snmpOptions.interface ? snmpOptions.interface : '0.0.0.0'; 
        this.prt        = snmpOptions.port ? snmpOptions.port : '161';  
        this.tmtRetries = snmpOptions.timeoutRetries ? snmpOptions.timeoutRetries : '0'; 
        this.tmtPeriod  = snmpOptions.timeoutPeriod ? snmpOptions.timeoutPeriod : '5000'; 
        this.listener   = snmpOptions.listener;  
		
        this.socket = dgram.createSocket('udp4');        
        this.socket.on('error',     this._onError.bind(this)); 
        this.socket.on('message',   this._receiveMessage.bind(this)); 
        this.socket.on('listening', this._onListening.bind(this)); 
        this.socket.on('close' ,    this._onClose.bind(this));
        this.socket.bind(this.prt, this.if); 

        /* Configure SNMP Trap Socket */
        if( snmpTrapOptions ) 
        {
            this.trapIf       = snmpTrapOptions.interface ? snmpTrapOptions.interface : '0.0.0.0'; 
            this.trapPrt      = snmpTrapOptions.port ? snmpTrapOptions.port : '162'; 
            this.trapListener = snmpTrapOptions.listener; 

            this.trapSocket = dgram.createSocket('udp4');
            this.trapSocket.on('error',     this._onError.bind(this));  
            this.trapSocket.on('message',   this._receiveMessage.bind(this)); 
            this.trapSocket.on('listening', this._onListening.bind(this)); 
            this.trapSocket.on('close' ,    this._onClose.bind(this));
            this.trapSocket.bind(this.trapPrt, this.trapIf); 
        }

        console.log(`SNMP on ${this.if}/${this.prt}, SNMPTrap on ${this.trapIf}/${this.trapPrt}`); 
    }
    
    _onListening() 
    { 
        const address = this.socket.address();
        console.log(`Server configured to listen to: ${this.outIf}:${this.outPrt}...`);
        console.log(`Server listening to: ${address.address}:${address.port}...`);
    }
    _onError() {}
    _onClose() {}

    _buildMessage(snmpOptions, pduType, pduControlFields, pduVariableBindings) 
    {
        /* Build Packet */
        let pdu = new snmpLib.pdu(pduType, pduControlFields, pduVariableBindings);
        let msg = new snmpLib.message(snmpOptions, pdu); 
        
        return msg; 
    }

    _sendMessage(message, destination, userCallback)
    {
        let self = this; // Anonymous function needs reference to this

        /* Serialize message object into buffer */
        let buffer = message.serialize(); 
		
        /* Build Request */
        let req = {}; 
        if( snmpLib.isRequest(message.pdu.type) )
        {
            req = 
            { 
                reqId: message.pdu.getControlField('requestId'), 
                cb: userCallback, 
                dst: destination, 
                msg: message, 
                retries: this.tmtRetries,
                timeoutId: undefined,
                timedOut: false,
                error: undefined
            };
            this.reqs.registerRequest(req); 
        }
		
 
        /* Send packet, handle timeout, pass up errors to user. */
        function transmit()
        {
            if( snmpLib.isRequest(message.pdu.type) )
            {
                /* Timeout handling */
                if( req.retries < 0 ) // Zero "retries" means send once
                {
                    /* Timeout Occured */
                    self.tmtCount++;
                    req.timedOut = true;
                    self.reqs.unregisterRequest(req);

                    req.cb(new Error('Timeout'));
                    // console.log(`${self.sendCount}sent, ${self.recvCount}replies, ${self.tmtCount}timed out, ${self.sendFailCount}send fails, ${self.recvAfterTimeout} late replies`);
                    return;
                }
                else { req.retries--; }
            }

            self.socket.send(buffer, 0, buffer.length, destination.port, destination.address, function sendCallback(error, data) 
            {
                if( error )
                {
                    /* Problem during send - error! */
                    self.sendFailCount++;
                    userCallback(new Error('Error in sending packet!'));
                }
                else
                {
                    /* Successful send - if request, set timeout! */
                    if( snmpLib.isRequest(message.pdu.type) )
                    {
                        self.sendCount++;
                        req.timeoutId = setTimeout(transmit, self.tmtPeriod);
                    }
                }
            });
        }

        /* Send Message! */
        transmit();
    }

    _receiveMessage(buffer, rinfo) // [TODO] add error handling on type
    {
        this.recvCount++; 

        /* Decode the message */  		
        let msg = {}; 
        try { msg = new snmpLib.message(buffer); } catch(error){ return; } // return if not an SNMP packet
        let type = msg.pdu.type;

        /* Received Response to Request */
        if( type == snmpLib.PDUTYPES.Response )
        {
            /* Request management */
            let reqId = msg.pdu.getControlField('requestId'); 

            if( this.reqs.hasOwnProperty(reqId) )
            {
                // Things are going as normal
                let req = this.reqs[reqId];
                this.reqs.unregisterRequest(req);
				
                /* Parse message into callback arguments (array of varbinds) */
                // [TODO] - move this into the commonPdu class as a .parseVarbinds() interface
                let parsedVarbinds = []; 
                for( let i = 0; i < msg.pdu.varbinds.length; i++ )
                {
                    let oid = msg.pdu.varbinds[i][0].oid;
                    let type = msg.pdu.varbinds[i][1].type;
                    let value = msg.pdu.varbinds[i][2].value;
                    let varbind = {oid, type, value}; 

                    parsedVarbinds.push(varbind); 
                }
				
                /* Initiate user callback */
                req.cb(null, parsedVarbinds);
            }
            else
            {
                // Presumable I got a message after it already timed out. Check timeoutCount? 
                this.recvAfterTimeout++; 
            }
        }
        /* Received SNMP Message*/
        else if( rinfo.port == this.prt && this.listener )
        {
            this.listener(null, msg, rinfo); // Pass event handling to user supplied function
        }
        /* Received SNMP Trap */
        else if( rinfo.port == this.trapPrt && this.trapListener ) 
        {
            this.trapListener(null, msg, rinfo); // Pass event handling to user supplied function
        }

        //[dbg]
        // console.log(`${this.sendCount}sent, ${this.recvCount}replies, ${this.tmtCount}timed out, ${this.sendFailCount}send fails, ${this.recvAfterTimeout} late replies`);
    }

    /* ------------- User Interface Methods ------------- */

    getRequest(snmpOptions, destination, oids, callback) // Functions like this abstract the UI from the varbinds, and setup all data needed for the message.
    {
        let pduType = snmpLib.PDUTYPES.GetRequest; // 160
        let pduControlFields = []; // Array of single property objects. 
        let pduVarbinds = [];      // Array of Arrays of single property objects. 
        let msg; 
        
        /* Build PDU Control Fields */
        pduControlFields = snmpLib.generateNewRequestCfs(this.reqs); 

        /* Build PDU Variable Bindings */		
        for( let i = 0; i < oids.length; i++ ) 
        {
            let varbind = []; // Build array
            varbind.push( {oid: oids[i]} ); 
            varbind.push( {value: undefined} );

            pduVarbinds.push(varbind); // Insert array into array
        }

        /* Build & Send Message */
        msg = this._buildMessage(snmpOptions, pduType, pduControlFields, pduVarbinds);
        this._sendMessage(msg, destination, callback); 
    }

    getNextRequest(snmpOptions, destination, oids, callback)
    {
        let pduType = snmpLib.PDUTYPES.GetNextRequest; // 161
        let pduControlFields = []; // Array of single property objects. 
        let pduVarbinds = [];      // Array of Arrays of single property objects. 
        let msg; 
        
        /* Build PDU Control Fields */
        pduControlFields = snmpLib.generateNewRequestCfs(this.reqs); 

        /* Build PDU Variable Bindings */		
        for( let i = 0; i < oids.length; i++ ) 
        {
            let varbind = []; // Build array
            varbind.push( {oid: oids[i]} ); 
            varbind.push( {value: undefined} );

            pduVarbinds.push(varbind); // Insert array into array
        }

        /* Build & Send Message */
        msg = this._buildMessage(snmpOptions, pduType, pduControlFields, pduVarbinds);
        this._sendMessage(msg, destination, callback); 
    }

    walk(snmpOptions, destination, rootOid, callback)
    {
        function receiveNext(err, varbind)
        {
            if( err ) { callback(err); }
            else
            {
                let oid = varbind[0].oid;
                let type = varbind[0].type; 
                if( !snmpLib.inTree(rootOid, oid) || type == snmpLib.DATATYPES.NoSuchObject || type == snmpLib.DATATYPES.NoSuchInstance || type == snmpLib.DATATYPES.EndOfMibView )
                {
                    // Walk complete. Return results.
                    callback(null, null);
                }
                else
                {
                    callback(null, varbind[0]);
                    this.getNextRequest(snmpOptions, destination, [oid], receiveNext.bind(this));
                }
                
            }
        }
        this.getNextRequest(snmpOptions, destination, [rootOid], receiveNext.bind(this));
    }

    table(snmpOptions, destination, tableOid, callback)
    {
        let walkResults = []; 

        function buildTable(err, varbinds)
        {
            if( err ) { callback(err); }
            else if( varbinds ) { walkResults.push(varbinds); }
            else if( varbinds == null )
            {
                let table = {}; // table = [indices][cols]
                let entries = walkResults.length;
                let indices = [];
                for( let i = 0; i < walkResults.length; i++ )
                {
                    let re = new RegExp(`${tableOid}.[0-9]+.[0-9]+.`);
                    let index = walkResults[i].oid.replace(re, '');
                    if( !indices.includes(index) ) { indices.push(index); }
                }
                let rows = indices.length; // number of unique index values
                let cols = parseInt(entries / rows);
                
                // Build empty table data structure
                for( let r = 0; r < rows; r++ )
                {
                    let row = [];
                    for( let c = 0; c < cols; c++ ) { row.push(undefined); }
                    table[indices[r]] = row;
                }

                let col = 0;
                for( let i = 0; i < walkResults.length; i++ )
                {
                    let re = new RegExp(`${tableOid}.[0-9]+.[0-9]+.`);
                    let index = walkResults[i].oid.replace(re, '');
                    let row = indices.indexOf(index);
                    table[indices[row]][col] = walkResults[i].value;
                    if( row == rows - 1 ) { col++; }
                }
    
                callback(null, table);
            }
        }

        this.walk(snmpOptions, destination, tableOid, buildTable.bind(this));
    }



    trap(snmpOptions, destination, enterprise, agent, generic, specific, varbinds, callback)
    {
        let pduType; 
        let pduControlFields = []; 
        let pduVarbinds = []; 
        let msg; 
		
        /* Build PDU Type & Control Fields */
        if( snmpOptions.version == '1' ) 
        {
            pduType = snmpLib.PDUTYPES.TrapV1; 

            pduControlFields.push( {enterprise:   enterprise} ); 
            pduControlFields.push( {agentAddress: agent} ); 
            pduControlFields.push( {genericTrap:  generic} ); 
            pduControlFields.push( {specificTrap: specific} ); 
            pduControlFields.push( {timestamp:    process.uptime()} );
        }
        else if ( snmpOptions.version == '2' )
        {
            pduType = snmpLib.PDUTYPES.TrapV2
        }		

        /* Build Varbinds */
        // [TODO]
        /* Okay so here... we need to supply the varbind type to _buildMessage(). 

		Also, you'll have to update getRequest() so that it takes incomplete-varbinds 
		(only oid is defined, not type and value) as an agrument and then builds complete varbinds for 
		buildMessage().
		*/

        /* Build & Send Message */
        // [TODO]
    }

    close()
    {
        this.socket.close();
        if( this.trapSocket ) { this.trapSocket.close(); }
        return;
    }   
}


module.exports = snmpServer;


            
            
     