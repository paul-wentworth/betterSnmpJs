/* Constants */
const ber = require ('asn1').Ber;

const PDUTYPES = 
{
    /* Common PDU Type */
    GetRequest: 160,
    GetNextRequest: 161,
    Response: 162, 
    SetRequest: 163, 
    InformRequest: 166,
    TrapV2: 167,

    /* Unique PDU Type */
    TrapV1: 164,
    GetBulkRequest: 165,
    Report: 168
};

const DATATYPES = {
    Boolean: 1,
    Integer: 2, 
    OctetString: 4, 
    Null: 5, 
    OID: 6, 
    IpAddress: 64,
    Counter: 65, 
    Gauge: 66, 
    TimeTicks: 67, 
    Opaque: 68, // DEPRECATED
    Counter64: 70, 
    NoSuchObject: 128, 
    NoSuchInstance: 129, 
    EndOfMibView: 130
};


/* Functions (Objects) */
function isRequest(pduType)
{
    return( pduType == PDUTYPES.GetRequest     ||
	    	pduType == PDUTYPES.GetNextRequest ||
   pduType == PDUTYPES.SetRequest     ||
   pduType == PDUTYPES.InformRequest  ||
   pduType == PDUTYPES.GetBulkRequest );
}

function generateNewRequestCfs(requestDb)
{
    let cfs = []; 
    let id  =  Math.floor(Math.random() + Math.random() * 10000000); //[TODO] look into improving this

    while( requestDb.hasOwnProperty(id) ) { id  =  Math.floor(Math.random() + Math.random() * 10000000); }
    cfs.push( {requestId:   id} ); 
    cfs.push( {errorStatus: 0} ); 
    cfs.push( {errorIndex:  0} );

    return cfs; 
}

function writeValue(type, value, writer) // [TODO] - test  
{
    if( type == DATATYPES.Boolean ) { writer.writeBoolean(value ? true : false); }
    else if( type == DATATYPES.Integer ) { writer.writeInt(Math.floor(value) | 0); } // Floor to int and use bitwise OR to force 32bit
    else if( type == DATATYPES.OctetString ) 
    { 
        if( typeof value == 'string' ) { writer.writeString(value); }
        else { writer.writeBuffer(value, DATATYPES.OctetString); }
    }
    else if( type == DATATYPES.Null ) { writer.writeNull(); }
    else if( type == DATATYPES.OID ) 
    { 
        if( value.charAt(0) == '.' ) { value = value.substring(1); } // Chop off starting '.' for ber writer library
        writer.writeOID(value); 
    }
    else if( type == DATATYPES.IpAddress ) 
    { 
        var octets = value.split('.'); 
        writer.writeBuffer(Buffer.from(octets), type);  
    }
    else if( type == DATATYPES.Counter ||
			 type == DATATYPES.Gauge   || 
			 type == DATATYPES.TimeTicks ) { writer.writeInt(Math.floor(value) | 0, type); }
    else if( type == DATATYPES.Counter64 ) { writer.writeBuffer(UInt64(value), type); }
    else { throw new Error('Invalid Datatype'); }	
}

function readValue(type, reader) // [TODO] - uint wrapper
{
    let value; 

    // [TODO] apparently somtimes ints are fucky and these asn1 functions need a wrapper.. see index.js from net-snmp library
    if( type == DATATYPES.Boolean )          { value = reader.readBoolean(); }
    else if( type == DATATYPES.Integer )     { value = reader.readInt(); }
    else if( type == DATATYPES.OctetString ) { value = reader.readString(); } 
    else if( type == DATATYPES.Null )        { value = reader.readByte(); }
    else if( type == DATATYPES.OID )         { value = reader.readOID(); }
    else if( type == DATATYPES.IpAddress )   { value = reader.readString(); }
    else if (type == DATATYPES.Counter ||
			 type == DATATYPES.Gauge   ||
			 type == DATATYPES.TimeTicks)    { value = reader.readString(type, true)[0]; }
    else if (type == DATATYPES.Opaque)       { value = reader.readString(); }
    else if (type == DATATYPES.Counter64)    { value = reader.readString(type, true); }
    else if (type == DATATYPES.NoSuchObject   ||
			 type == DATATYPES.NoSuchInstance ||
			 type == DATATYPES.EndOfMibView) 
    { 
        reader.readByte(); 
        reader.readByte(); 
        value = null;
    }
    else { throw new Error(`Error: Invalid BER Datatype [${type}]`); }

    return value; 
}


/* Classes */
class requestDatabase // [TODO] implement timeouts via this class
{
    constructor() { this.reqCount = 0; }
	
    registerRequest(request)
    {
        let id = `${request.reqId}`;
        if( !this.hasOwnProperty(id) )
        {
            this[id] = request;
            this.reqCount++; 
        }
        else { throw new Error(`Error: request ID collision (duplicate) [${id}]`); }
    }

    unregisterRequest(request)
    {
        let id = request.reqId; 
        if( this.hasOwnProperty(id) )
        {
            clearTimeout(request.timeoutId); 
            delete this[id];
            this.reqCount--; 
        }
        else { throw new Error(`Error: request ID does not exist [${id}]`); }
    }
}

class pdu
{
    constructor(...params) // !OVERLOADED CONSTRUCTOR
    {
        if( params.length == 1 ) 
        {
            // params = [buffer]
            this.type = undefined;
            this.cfs = [];
            this.varbinds = [];
            this.deserialize(params[0]);
        }
        else 
        {
            // params = [pduType, pduControlFields, pduVariableBindings]
            this.type     = params[0]; 
            this.cfs      = params[1]; 
            this.varbinds = params[2]; 
        }
    }

    getControlField(controlFieldName) 
    {
        let retVal = null; 

        for( let i = 0; i < this.cfs.length; i++ )
        {
            if( this.cfs[i].hasOwnProperty(controlFieldName) )
            {
                retVal = this.cfs[i][controlFieldName];
                break; 
            }
        }

        return retVal; 
    } 
    parseVariableBindings() {} // Return array of varbind {oid: x, value: y} object(s)

    serialize(writer)
    {
        /* TYPE */
        writer.startSequence(this.type); // Start PDU sequence
		
        /* CFs */
        for( let i = 0; i < this.cfs.length; i++ )
        {
            let value = this.cfs[i][ Object.keys(this.cfs[i])[0] ]; // array of {"key" : value}
            writeValue(DATATYPES.Integer, value, writer); 
        }
		
        /* VARBINDs */
        writer.startSequence(); // Start Varbinds sequence
        for( let i = 0; i < this.varbinds.length; i++ )
        {
            writer.startSequence(); 
            writer.writeOID(this.varbinds[i][0].oid); // array of arrays of {"key" : value}
			
            let value = this.varbinds[i][1].value;
            writeValue(DATATYPES.Null, value, writer);
            writer.endSequence(); 
        }
        writer.endSequence(); // End Varbinds sequence

        writer.endSequence();  // End PDU sequence
        return writer;
    }

    deserialize(reader)
    {
        /* TYPE */
        let type;
        type = reader.readSequence(); // Start PDU sequence
        this.type = type; // Set PDU type

        /* CFs */
        switch( type )
        {
            /* Common PDU Types */
        case PDUTYPES.GetRequest:
        case PDUTYPES.GetNextRequest:
        case PDUTYPES.Response:
        case PDUTYPES.SetRequest:
        case PDUTYPES.InformRequest:
        case PDUTYPES.TrapV2:
        {
            this.cfs.push( {requestId:   reader.readInt()} );
            this.cfs.push( {errorStatus: reader.readInt()} ); 
            this.cfs.push( {errorStatus: reader.readInt()} ); 
            break; 
        }
        /* Unknown Type */
        default: { throw new Error(`Error: Unknown PDU Type [${type}]`); }
        }

        /* VARBINDs */
        reader.readSequence(); // Start Varbinds sequence
        while( reader.readSequence() != null ) 
        {
            let oid   = reader.readOID();
            let type  = reader.peek(); 
            let value = readValue(type, reader); 
            this.varbinds.push( [{oid: oid}, {value: value}] ); 
        }

        return reader; 
    }
}

class messageV1V2
{
    constructor(...params) // !OVERLOADED CONSTRUCTOR
    {
        if( params.length == 1 ) 
        { 
            // params = [buffer]
            this.version, this.community, this.pdu; 
            this.deserialize(params[0]); 
        }
        else
        {
            // params = [snmpOptions, snmpPdu]
            this.version   = params[0].version;
            this.community = params[0].community; 
            this.pdu       = params[1];
        }
    }

    serialize()
    {
        let writer = new ber.Writer(); 

        writer.startSequence(); 
        writer.writeInt(this.version); 
        writer.writeString(this.community);
        this.pdu.serialize(writer);
        writer.endSequence(); 

        return writer.buffer;
    }

    deserialize(buffer)
    {
        let reader = new ber.Reader(buffer); 

        reader.readSequence(); 
        this.version   = reader.readInt(); 
        this.community = reader.readString(); 
        this.pdu       = new pdu(reader); 
    }
}

function inTree(root, oid) 
{
    if( oid.length <= root.length ) { return false; }
    for( let i = 0; i < root.length; i++ ) { if( oid[i] !== root[i] ) { return false; } }
    return true;
}


module.exports.PDUTYPES = PDUTYPES; 
module.exports.isRequest = isRequest;
module.exports.generateNewRequestCfs = generateNewRequestCfs;
module.exports.pdu = pdu;
module.exports.message = messageV1V2; 
module.exports.requestDatabase = requestDatabase; 
module.exports.inTree = inTree;
//module.exports.messageV3 = messageV3;
