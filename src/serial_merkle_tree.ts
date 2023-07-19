import { HashPath, Sha256Hasher } from './utils';

const MAX_DEPTH = 32;
const LEAF_BYTES = 64; 

export class MerkleTree {
  public hasher = new Sha256Hasher();
  public root = Buffer.alloc(32);

  // Object array decleration representing 'KV' store
  public LeafNodes: Nodes.LeafNode[] = [];
  public InternalNodes: Nodes.InternalNode[][] = [];
  public HelperNodes: Nodes.InternalNode[] = [];
  public PrecomputedZeroHashes: Nodes.InternalNode[] = [];

  // Constructor generates merkle root for empty tree
  constructor(private name: string, public depth: number) {
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Bad depth');
    }
    
    for (let i = 0; i <= depth; i++) {
      this.root = this.hasher.compress(this.root, this.root);
      this.PrecomputedZeroHashes.push({
        leftChild: null, 
        rightChild: null,
        hash: this.root,
      });
    }
  }

  /**
   * Initialize new merkle tree instance
   */
  static async new(name: string, depth = MAX_DEPTH) {
      return new MerkleTree(name, depth);
  }

  /**
   * Construct merkle tree recursively
   */
  async constructMerkleTree(internal: Nodes.InternalNode[], count: number, z: number, t: number): Promise<any> {
    // Intermediary array to help with recursion
    let intermediaryArray: Nodes.InternalNode[] = [];

    // Calculate the number of parent nodes based on the number of child nodes
    let parents = Math.floor(count / 2 + count % 2);

    // Construct merkle tree for 'Inner Tree'
    let j = 0;
    for (let i = 0; i < count; i += 2) {
      intermediaryArray[j] = {
        hash: this.hasher.compress(internal[i].hash!, internal[i + 1].hash!),
        leftChild: internal[i],
        rightChild: internal[i + 1],
      };
      j++;
      z++;
      
      // Base case to terminate recursion
      if (parents == 1) {
        // Append root of 'Inner Tree'
        this.InternalNodes.push(intermediaryArray); 
        this.HelperNodes.push({
          leftChild: this.InternalNodes[this.InternalNodes.length - 1][0],
          rightChild: null,
          hash: this.InternalNodes[this.InternalNodes.length - 1][0].hash!,
        });

        // Construct merkle tree for 'Outer Tree' if # number leaves != tree depth
        if (Math.log2(this.LeafNodes.length) != (2^this.depth)) {
          let y = Math.log2(this.LeafNodes.length);
          const OUTER =  this.depth - Math.log2(this.LeafNodes.length);
          for (let i = 0; i < OUTER; i++) { 
            this.HelperNodes.push({
              leftChild: this.HelperNodes[this.HelperNodes.length - 1], 
              rightChild: this.PrecomputedZeroHashes[y],
              hash: this.hasher.compress(this.HelperNodes[this.HelperNodes.length - 1].hash!, this.PrecomputedZeroHashes[y].hash!),
            });
            y++;
          }
        }
        this.root = this.HelperNodes[this.HelperNodes.length - 1].hash!;
        return this.root;
      }
    }

    // Append internal nodes to jagged 2D array representing merkle tree state
    this.InternalNodes.push(intermediaryArray); 
    t++;
    
    // Recursively call 'constructMerkleTree'
    return this.constructMerkleTree(intermediaryArray, parents, z, t);
  }

  /**
   * Returns the hash path for `index`
   */
  async getHashPath(index: number) {
    // Instantiate hash path array for transaction with 'index'
    let TxHashPath: Buffer[] = [];

    // Convert index from decimal to binary array
    let binary_array = Number(index).toString(2);
    binary_array = '0'.repeat(Math.log2(this.LeafNodes.length) - binary_array.length) + binary_array;

    // Construct hash path for 'Outer Tree' if # leaves != tree depth using precomputed zero hashes
    const OUTER = this.depth - Math.log2(this.LeafNodes.length);
    const length = this.HelperNodes.length - OUTER;  
    if (Math.log2(this.LeafNodes.length) != (2^this.depth)) { 
      for (let i = 0; i < OUTER; i++) {
        TxHashPath.push(this.HelperNodes[length + i].leftChild?.hash!);
        TxHashPath.push(this.HelperNodes[length + i].rightChild?.hash!);
      }
    }

    // Indices for 'Inner Tree'
    let indice = 0;
    let binary_index = 0;

    // Construct hash path for 'Inner Tree'
    let t = this.InternalNodes.length - 1;
    TxHashPath.unshift(this.InternalNodes[t][0].rightChild!.hash!);
    TxHashPath.unshift(this.InternalNodes[t][0].leftChild!.hash!);
    const INNER = Math.log2(this.LeafNodes.length) - 1; 

    for (let i = INNER; i > 0; i--) {
        t--;
        indice = binary_array[binary_index] == '0' ? 2 * indice : 2 * indice + 1;
        binary_index++;

        TxHashPath.unshift(this.InternalNodes[t][indice].rightChild!.hash!);
        TxHashPath.unshift(this.InternalNodes[t][indice].leftChild!.hash!);
    }

    // Construct 2D array for hash path
    const hashpath = [];
    while(TxHashPath.length) hashpath.push(TxHashPath.splice(0,2));

    return new HashPath(hashpath);
  }

  /**
   * Enables light client to request a merkle path proof for `index`
   */
  async getMerklePathProof(index: number): Promise<Buffer[]> {
    // Instantiate merkle path proof for transaction with 'index'
    let merklePathProof: Buffer[] = [];

    // Determine the direction of the siblings in the merkle path
    var leftChild = index % 2 === 0;
    var siblingIndex = leftChild ? index + 1 : index - 1;

    // Add leaf nodes in merkle path proof
    merklePathProof.push(this.LeafNodes[index].hash!);
    merklePathProof.push(this.LeafNodes[siblingIndex].hash!);

    // Add 'Inner Tree' to merkle path proof
    let t = 0;
    let depth = Math.log2(this.LeafNodes.length);
    for (let i = 1; i < depth; i++) {
      index = Math.floor(index / 2);  
      leftChild = index % 2 === 0;
      siblingIndex = leftChild ? index + 1 : index - 1;
      merklePathProof.push(this.InternalNodes[t][siblingIndex].hash!);

      t++;
    }

    // Add 'Outer Tree' to merkle path proof
    if (Math.log2(this.LeafNodes.length) != (2^this.depth)) {
      let y = Math.log2(this.LeafNodes.length);
      const OUTER =  this.depth - Math.log2(this.LeafNodes.length);
      for (let i = 0; i < OUTER; i++) { 
        merklePathProof.push(this.PrecomputedZeroHashes[y].hash!);
        y++;
      }
    }

    return merklePathProof;
  }

  /**
   * Enables light clients to perform Simple Payment Verification (SPV) 
   * by verifying merkle path proof by reconstructing merkle root
   * from merkle path proof. 
   */
   async verifyMerklePathProof(index: number, merklePathProof:  Buffer[], root: Buffer): Promise<Buffer>  {
    for (let i = 0; i < merklePathProof.length - 1; i++) {
      var leftChild = index % 2 === 0;
      merklePathProof[0] = leftChild ? 
        this.hasher.compress(merklePathProof[0], merklePathProof[i + 1]) : 
        this.hasher.compress(merklePathProof[i + 1], merklePathProof[0]);
      index = Math.floor(index / 2);
    }

    return merklePathProof[0];
   }  

  /**
   * Updates the tree with `value` at `index`. Returns the new tree root.
   */
  async updateElement(index: number, value: Buffer) {
    // Update the value at index
    this.LeafNodes[index].value = value;

    // Reconstruct the merkle root
    this.root = await this.constructMerkleTree(this.LeafNodes, this.LeafNodes.length, 0, 0); 
  }

  /**
   * Creates the leaf nodes in the merkle tree 
   */
  async createLeafNode(values: Buffer[], count: number) {
    this.LeafNodes = [];
    for (let i = 0; i < count; i++) {
      this.LeafNodes.push({ 
        index: i, 
        value: values[i], 
        hash: this.hasher.hash(values[i]),
        leftChild: null,
        rightChild: null,
      });
    }
    return this.LeafNodes;
  }

  /**
   * Returns merkle root
   */
  getRoot() {
    return this.root;
  }
}