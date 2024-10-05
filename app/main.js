const dgram = require("dgram");
const { builtinModules } = require("module");

function createDNSHeader(buff) {
  const header = Buffer.alloc(12); // DNS header is 12 bytes

  // Packet Identifier (ID) - 16 bits: Set to 1234 (0x04D2 in hex)
  header.writeUInt16BE(buff.readUInt16BE(0), 0);

  // Flags - 16 bits: QR = 1, OPCODE = 0, AA = 0, TC = 0, RD = 0, RA = 0, Z = 0, RCODE = 0
  // QR (1) OPCODE (4) AA (1) TC (1) RD (1) RA (1) Z (3) RCODE (4)
  // 0x8000: QR = 1 (response), everything else = 0 
  // Extract the necessary fields from the incoming buffer
  const opcode = buff.readUInt16BE(2) & 0x7800; // Extract OPCODE bits
  const rd = buff.readUInt16BE(2) & 0x0100; // Extract RD bit
  const rcode = (opcode === 0) ? 0 : 4; // Set RCODE based on OPCODE

  // QR = 1 (response), AA = 0, TC = 0, RA = 0
  const flags = 0x8000 | opcode | rd | rcode; // Construct flags with RD included
  header.writeUInt16BE(flags, 2);

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

function getDomainName(buff) {
  let index = 12; // DNS queries start at offset 12
  let domain = "";

  // Loop through domain name labels
  while (true) {
    if (index >= buff.length) { // Check if index is out of buffer range
      throw new Error("Index out of bounds while parsing domain name");
    }

    const length = buff.readUInt8(index); // Read the length of the label

    if (length === 0) break; // Null byte indicates the end of the domain name

    // Check if length is valid and within buffer bounds
    if (index + length + 1 > buff.length) {
      throw new Error("Invalid domain name length in buffer");
    }

    // Read the domain label and append to domain string
    domain += buff.toString("utf-8", index + 1, index + 1 + length) + ".";

    // Move to the next label (length + 1 for the length byte itself)
    index += length + 1;
  }

  return domain.slice(0, -1); // Remove the trailing dot
}

function getEncodedName(domain) {
  const domainParts = domain.split(".");
  const encodedParts = [];

  domainParts.forEach((part) => {
    const lengthBuffer = Buffer.alloc(1); // Length of each part
    lengthBuffer.writeUInt8(part.length, 0); // Write the length as a single byte
    const nameBuffer = Buffer.from(part, "utf-8"); // Write the part itself
    encodedParts.push(lengthBuffer, nameBuffer);
  });

  // Push the final null byte
  encodedParts.push(Buffer.from([0x00]));

  return Buffer.concat(encodedParts); // Return the concatenated buffer
}

function createQuestionSection(buff) {
  // Encode the domain name codecrafters.io
  

  // const name = Buffer.from([
  //   0x0c, // Length of "codecrafters" (12 bytes)
  //   0x63, 0x6f, 0x64, 0x65, 0x63, 0x72, 0x61, 0x66, 0x74, 0x65, 0x72, 0x73, // "codecrafters"
  //   0x02, // Length of "io" (2 bytes)
  //   0x69, 0x6f, // "io"
  //   0x00, // Null byte to terminate the domain name
  // ]);

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(1, 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(1, 0); // 1 corresponds to IN (Internet class)

  // Concatenate all parts
  const domain = getDomainName(buff)
  const name = getEncodedName(domain)
  return Buffer.concat([name, type, classField]);
}

function createAnswerSection(buff){

  const domain = getDomainName(buff)
  const name = getEncodedName(domain)

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
    const question = createQuestionSection(buf)
    const answers = createAnswerSection(buf)
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
