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

  // QR = 1 (response), AA = 0, TC = 0, RA = 0QD
  const flags = 0x8000 | opcode | rd | rcode; // Construct flags with RD included
  header.writeUInt16BE(buff.readUInt16BE(2), 2);

  // QDCOUNT (number of questions) - 16 bits: Set to 0 for this stage
  header.writeUInt16BE(1, 4);

  // ANCOUNT (number of answers) - 16 bits: Set to 0 for this stage
  header.writeUInt16BE(0, 6);

  // NSCOUNT (number of authority records) - 16 bits: Set to 0
  header.writeUInt16BE(0, 8);

  // ARCOUNT (number of additional records) - 16 bits: Set to 0
  header.writeUInt16BE(0, 10);

  return header;
}

function getDomainName(buff,offset = 12) {
  let domain = "";
  let jumped = false;
  let jumpOffset = -1

  // Loop through domain name labels
  while (true) {
    const length = buff.readUInt8(offset);
    // Check for pointer (compression)
    if ((length & 0xC0) === 0xC0) { // First two bits are 11 (indicating a pointer)
      if (!jumped) {
        jumpOffset = offset + 2; // Save where to jump back to after pointer
      }
      const pointer = buff.readUInt16BE(offset) & 0x3FFF; // Mask first 2 bits, get pointer
      offset = pointer; // Jump to pointer location
      jumped = true;
      continue; // Continue parsing at the new offset
    }
      if (offset >= buff.length) { // Check if offset is out of buffer range
        throw new Error("offset out of bounds while parsing domain name");
      }

    if (length === 0) break; // Null byte indicates the end of the domain name

    // Check if length is valid and within buffer bounds
    if (offset + length + 1 > buff.length) {
      throw new Error("Invalid domain name length in buffer");
    }

    domain += buff.toString("utf-8", offset + 1, offset + 1 + length) + ".";
    offset += length + 1;
  }
  
  if (jumped && jumpOffset !== -1) {
    offset = jumpOffset; // If jumped, restore the original offset
  }
  return { domain: domain.slice(0, -1), newOffset: offset + 1 };
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

function createQuestionSection(domain) {
  // Encode the domain name codecrafters.io

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(1, 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(1, 0); // 1 corresponds to IN (Internet class)

  // Concatenate all parts
  const name = getEncodedName(domain)
  return Buffer.concat([name, type, classField]);
}

function createAnswerSection(buff,domain){

  const name = getEncodedName(domain)

  // Type (A record) - 2 bytes, big-endian
  const type = Buffer.alloc(2);
  type.writeUInt16BE(buff.readUInt16BE(0), 0); // 1 corresponds to an A record

  // Class (IN) - 2 bytes, big-endian
  const classField = Buffer.alloc(2);
  classField.writeUInt16BE(buff.readUInt16BE(2), 0); // 1 corresponds to IN (Internet class)

  // TTL (Time to live) - 4 bytes, big-endian
  const ttl = Buffer.alloc(4);
  ttl.writeUInt32BE(buff.readUInt32BE(4), 0); // TTL of 60 seconds

  // RDLENGTH (length of RDATA) - 2 bytes, big-endian
  const rdlength = Buffer.alloc(2);
  rdlength.writeUInt16BE(buff.readUInt16BE(8), 0); // 4 bytes for the IPv4 address

  // RDATA (IPv4 address) - 4 bytes, big-endian
  const rdata = Buffer.from(buff.readUInt32BE(10)); // Example IP address (8.8.8.8)

  // Concatenate all parts
  return Buffer.concat([name, type, classField, ttl, rdlength, rdata]);
}

// let resolverArgIndex = process.argv.indexOf("--resolver");
// let resolverAdress = null
// if(resolverArgIndex !== -1 && process.argv.length > resolverArgIndex + 1)
// {
//   resolverAdress = process.argv[resolverArgIndex + 1]
//   console.log(resolverAdress)
// }else {
//   console.log("No resolver address provided. Use --resolver <address>");
//   process.exit(1);
// }

// const [resolverIPAdress,resolverPort] = resolverAdress.split(":")

// const udpSocket = dgram.createSocket("udp4");
// udpSocket.bind(2053, "127.0.0.1");

// function queryToResolver(queryBuffer, resolverIP, resolverPort, clientInfo)
// {
//   // Define resolverSocket inside this function
//   const resolverSocket = dgram.createSocket("udp4");

//   // Send the query to the resolver (e.g., Google DNS at 8.8.8.8)
//   resolverSocket.send(queryBuffer, resolverPort, resolverIP, (err) => {
//     if (err) {
//       console.error("Error forwarding query to resolver:", err);
//     }
//   });

//   // Listen for the response from the resolver
//   resolverSocket.on("message", (resolverResponse) => {
//     console.log("Received response from resolver");

//     // Send the response back to the client
//     handleResolverResponse(resolverResponse, clientInfo);

//     // Close resolver socket after forwarding
//     resolverSocket.close();
//   });

//   resolverSocket.on("error", (err) => {
//     console.error(`Resolver socket error: ${err}`);
//   });
// }

// function handleResolverResponse(buf,clientInfo){
//   udpSocket.send(buf,clientInfo.port,clientInfo.address, (err) => {
//     if (err) {
//       console.error("Error sending response back to client:", err);
//     } else {
//       const header = createDNSHeader(buf)
//       let offset = 12; // DNS header ends at byte 12
//       const questionCount = buf.readUInt16BE(4); // QDCOUNT
  
//       let questions = [];
//       for (let i = 0; i < questionCount; i++) {
//         const question = getDomainName(buf, offset);
//         console.log(question)
//         questions.push(question.domain);
//         offset = question.newOffset + 4; // Update offset after reading each question
//       }
//       console.log(questions)
//       const questionSection = Buffer.concat(
//         questions.map(domain => createQuestionSection(domain))
//       );
  
//       const answerSection = Buffer.concat(
//         questions.map(domain => createAnswerSection(domain))
//       );
  
//       const response = Buffer.concat([header, questionSection, answerSection]);
//       udpSocket.send(response, rinfo.port, rinfo.address);
//     }
//   })
// }

// udpSocket.on("message", (buf, rinfo) => {
//   try {
//     const header = createDNSHeader(buf)
//     let offset = 12; // DNS header ends at byte 12
//     const questionCount = buf.readUInt16BE(4); // QDCOUNT

//     let questions = [];
//     for (let i = 0; i < questionCount; i++) {
//       const question = getDomainName(buf, offset);
//       console.log(question)
//       questions.push(question.domain);
//       offset = question.newOffset + 4; // Update offset after reading each question
//     }
//     console.log(questions)
//     const questionSection = Buffer.concat(
//       questions.map(domain => createQuestionSection(domain))
//     );

//     const answerSection = Buffer.concat(
//       questions.map(domain => createAnswerSection(domain))
//     );

//     const response = Buffer.concat([header, questionSection, answerSection]);
//     resolverSocket.send(response, rinfo.port, rinfo.address);
//   } catch (e) {
//     console.log(`Error receiving data: ${e}`);
//   }
// });

// resolverSocket.on("message", (buf,rinfo)=>{
//   try {
//     queryToResolver(buf,resolverIPAdress,resolverPort,rinfo)
//     // const header = createDNSHeader(buf)
//     // let offset = 12; // DNS header ends at byte 12
//     // const questionCount = buf.readUInt16BE(4); // QDCOUNT

//     // let questions = [];
//     // for (let i = 0; i < questionCount; i++) {
//     //   const question = getDomainName(buf, offset);
//     //   console.log(question)
//     //   questions.push(question.domain);
//     //   offset = question.newOffset + 4; // Update offset after reading each question
//     // }
//     // console.log(questions)
//     // const questionSection = Buffer.concat(
//     //   questions.map(domain => createQuestionSection(domain))
//     // );

//     // const answerSection = Buffer.concat(
//     //   questions.map(domain => createAnswerSection(domain))
//     // );

//     // const response = Buffer.concat([header, questionSection, answerSection]);
//     // udpSocket.send(response, rinfo.port, rinfo.address);

//   } catch (e) {
//     console.log(`Error receiving data: ${e}`);
//   }
// })

// udpSocket.on("error", (err) => {
//   console.log(`Error: ${err}`);
// });

// udpSocket.on("listening", () => {
//   const address = udpSocket.address();
//   console.log(`Server listening ${address.address}:${address.port}`);
// });

const resolverArgIndex = process.argv.indexOf("--resolver");
let resolverAddress = null;
if (resolverArgIndex !== -1 && process.argv.length > resolverArgIndex + 1) {
  resolverAddress = process.argv[resolverArgIndex + 1];
} else {
  console.log("No resolver address provided. Use --resolver <address>");
  process.exit(1);
}

const [resolverIP, resolverPort] = resolverAddress.split(":");
let answers = [];


// Create UDP socket for your DNS server
const udpSocket = dgram.createSocket("udp4");
udpSocket.bind(2053, "127.0.0.1");

udpSocket.on("message", (buf, rinfo) => {
  try {
    console.log("Received query from client");
    let realID;
    let questions = [];
    let domains = [];
    const header = createDNSHeader(buf)
    let offset = 12; // DNS header ends at byte 12
    const questionCount = buf.readUInt16BE(4); // QDCOUNT
    for (let i = 0; i < questionCount; i++) {
      const question = getDomainName(buf, offset);
      realID = buf.readInt16BE(0)
      buf.writeInt16BE(Math.floor(1000 + Math.random() * 9000),0)
      const questionSection = createQuestionSection(question.domain)
      const response = Buffer.concat([header,questionSection])
      console.log(response.toString('hex'))
      forwardQueryToResolver(response, resolverIP, resolverPort);
      domains.push[question.domain]
      questions.push(questionSection);
      offset = question.newOffset + 4; // Update offset after reading each question
    }
    handleResolverResponse(answers, rinfo, questions, realID);
    // Forward query to the specified resolver
    
  } catch (e) {
    console.error(`Error processing query: ${e}`);
  }
});

async function forwardQueryToResolver(queryBuffer, resolverIP, resolverPort) {
  const resolverSocket = dgram.createSocket("udp4");
  // console.log(queryBuffer.toString('hex'));
  // Send the entire query (including multiple questions) to the external resolver
  resolverSocket.send(queryBuffer, resolverPort, resolverIP, (err) => {
    if (err) {
      console.error("Error forwarding query to resolver:", err);
    }
  });
    resolverSocket.on("message", (resolverResponse) => {
      console.log("Received response from resolver");
      console.log(resolverResponse.toString('hex'))
      const dnsResponse = Buffer.from(resolverResponse.toString('hex'),'hex')
      // DNS Header is 12 bytes
      const headerLength = 12;

      // Skipping the Question Section: variable length based on domain name
      // We know this is how the domain is formatted (length-prefixed labels).
      // Example: 03646566116c6f6e67617373646f6d61696e6e616d6503636f6d

      // The domain name ends with `00` (null terminator), and after that, there are 4 more bytes for QTYPE and QCLASS.
      const questionLength = dnsResponse.indexOf(0x00, headerLength) - headerLength + 5; // +5 for the null byte + QTYPE + QCLASS

      // Answer section starts after the question
      const answerOffset = headerLength + questionLength;

      // Extract the answer section
      const answerSection = dnsResponse.slice(answerOffset);
      answers.push(answerSection)
      console.log("Answer Section:", answerSection.toString('hex'));
      resolverSocket.close();
    });

}

function handleResolverResponse(resolverResponse, clientInfo, questions, realID) {
  // Forward the resolver's response back to the original client
  let section = []
  const header = Buffer.concat([realID,resolverResponse.readUInt16BE(2),resolverResponse.readUInt16BE(4),resolverResponse.readUInt16BE(6),resolverResponse.readUInt16BE(8),resolverResponse.readUInt16BE(10)])
  section.push[header]
  for(i=0;i<questions.length;i++)
  {
    section.push(questions[i])
  }
  for(i=0;i<questions.length;i++)
  {
    section.push(answers[i])
  }
  udpSocket.send(Buffer.concat(section), clientInfo.port, clientInfo.address, (err) => {
    if (err) {
      console.error("Error sending response back to client:", err);
    } else {
      console.log("Response sent back to client at:", clientInfo.address); 
    }
  });
  answers = []
}

udpSocket.on("error", (err) => {
  console.log(`Error: ${err}`);
});

udpSocket.on("listening", () => {
  const address = udpSocket.address();
  console.log(`Server listening on ${address.address}:${address.port}`);
});