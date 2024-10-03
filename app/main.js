const dgram = require("dgram");

function createDNSHeader() {
  const header = Buffer.alloc(12); // DNS header is 12 bytes

  // Packet Identifier (ID) - 16 bits: Set to 1234 (0x04D2 in hex)
  header.writeUInt16BE(1234, 0);

  // Flags - 16 bits: QR = 1, OPCODE = 0, AA = 0, TC = 0, RD = 0, RA = 0, Z = 0, RCODE = 0
  // QR (1) OPCODE (4) AA (1) TC (1) RD (1) RA (1) Z (3) RCODE (4)
  // 0x8000: QR = 1 (response), everything else = 0
  header.writeUInt16BE(0x8000, 2);

  // QDCOUNT (number of questions) - 16 bits: Set to 0 for this stage
  header.writeUInt16BE(1, 4);

  // ANCOUNT (number of answers) - 16 bits: Set to 0 for this stage
  header.writeUInt16BE(1, 6);

  // NSCOUNT (number of authority records) - 16 bits: Set to 0
  header.writeUInt16BE(0, 8);

  // ARCOUNT (number of additional records) - 16 bits: Set to 0
  header.writeUInt16BE(0, 10);

  return header;
}

function createQuestionSection() {
  // Encode the domain name codecrafters.io
  const name = Buffer.from([
    0x0c, // Length of "codecrafters" (12 bytes)
    0x63, 0x6f, 0x64, 0x65, 0x63, 0x72, 0x61, 0x66, 0x74, 0x65, 0x72, 0x73, // "codecrafters"
    0x02, // Length of "io" (2 bytes)
    0x69, 0x6f, // "io"
    0x00, // Null byte to terminate the domain name
  ]);

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(1, 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(1, 0); // 1 corresponds to IN (Internet class)

  // Concatenate all parts
  return Buffer.concat([name, type, classField]);
}

function createAnswerSection(){

  // Encode the domain name codecrafters.io (same as in the question section)
  const name = Buffer.from([
    0x0c, // Length of "codecrafters" (12 bytes)
    0x63, 0x6f, 0x64, 0x65, 0x63, 0x72, 0x61, 0x66, 0x74, 0x65, 0x72, 0x73, // "codecrafters"
    0x02, // Length of "io" (2 bytes)
    0x69, 0x6f, // "io"
    0x00, // Null byte to terminate the domain name
  ]);

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(1, 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(1, 0); // 1 corresponds to IN (Internet class)

  // TTL (Time to live) - 4 bytes, big-endian
  const ttl = Buffer.alloc(4);
  ttl.writeUInt32BE(60, 0); // TTL of 60 seconds

  // RDLENGTH (length of RDATA) - 2 bytes, big-endian
  const rdlength = Buffer.alloc(2);
  rdlength.writeUInt16BE(4, 0); // 4 bytes for the IPv4 address

  // RDATA (IPv4 address) - 4 bytes, big-endian
  const rdata = Buffer.from([8, 8, 8, 8]); // Example IP address (8.8.8.8)

  // Concatenate all parts
  return Buffer.concat([name, type, classField, ttl, rdlength, rdata]);
}

const udpSocket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");

udpSocket.on("message", (buf, rinfo) => {
  try {
    const header = createDNSHeader(buf)
    const question = createQuestionSection()
    const answers = createAnswerSection()
    const response = Buffer.concat([header,question,answers])
    udpSocket.send(response, rinfo.port, rinfo.address);
  } catch (e) {
    console.log(`Error receiving data: ${e}`);
  }
});

udpSocket.on("error", (err) => {
  console.log(`Error: ${err}`);
});

udpSocket.on("listening", () => {
  const address = udpSocket.address();
  console.log(`Server listening ${address.address}:${address.port}`);
});
