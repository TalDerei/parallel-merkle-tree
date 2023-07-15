import { HashPath, Sha256Hasher } from './utils';

const MAX_DEPTH = 32;
const LEAF_BYTES = 64; 

export class MerkleTree {
  public hasher = new Sha256Hasher();
  public root = Buffer.alloc(32);

  // Object array decleration representing 'KV' store
  public LeafNodes: Nodes.LeafNode[] = [];
  public InternalNodes: Nodes.InternalNode[] = [];
  public HashPath: Buffer[] = [];
  public ZeroHashes: Nodes.InternalNode[] = [];

  // Constructor generates merkle root for empty tree
  constructor(private name: string, public depth: number) {
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Bad depth');
    }
    
    for (let i = 0; i <= depth; i++) {
      this.root = this.hasher.compress(this.root, this.root);
      this.ZeroHashes.push({
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
      const tree = new MerkleTree(name, depth);
      return tree;
  }

  /**
   * Construct merkle tree recursively
   */
  async constructMerkleTree(internal: Nodes.InternalNode[], count: number, z: number): Promise<any> {
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
      this.InternalNodes[z] = intermediaryArray[j];
      j++;
      z++;
      
      // Base case to terminate recursion
      if (parents == 1) {
        // Construct merkle tree for 'Outer Tree' if # number leaves != tree depth
        if (Math.log2(this.LeafNodes.length) != (2^this.depth)) {
          let y = Math.log2(this.LeafNodes.length);
          const OUTER =  this.depth - Math.log2(this.LeafNodes.length);
          for (let i = 0; i < OUTER; i++) { 
            this.InternalNodes.push({
              leftChild: this.InternalNodes[this.InternalNodes.length - 1], 
              rightChild: this.ZeroHashes[y],
              hash: this.hasher.compress(this.InternalNodes[this.InternalNodes.length - 1].hash!, this.ZeroHashes[y].hash!),
            });
            y++;
          }
        }
        this.root = this.InternalNodes[this.InternalNodes.length - 1].hash!;
        return this.root;
      }
    }
    
    // Recursively call 'constructMerkleTree'
    return this.constructMerkleTree(intermediaryArray, parents, z);
  }

  /**
   * Returns the hash path for `index`
   */
  async getHashPath(index: number) {
    // Convert index from decimal to binary array
    let binary_array = Number(index).toString(2);
    binary_array = '0'.repeat(Math.log2(this.LeafNodes.length) - binary_array.length) + binary_array;

    // Construct hash path for 'Outer Tree' if # leaves != tree depth using precomputed zero hashes
    const OUTER = this.depth - Math.log2(this.LeafNodes.length);
    const length = this.InternalNodes.length - OUTER;
    if (Math.log2(this.LeafNodes.length) != (2^this.depth)) { 
      for (let i = 0; i < OUTER; i++) {
        this.HashPath.push(this.InternalNodes[length + i].leftChild?.hash!);
        this.HashPath.push(this.InternalNodes[length + i].rightChild?.hash!);
      }
    }

    // Indices for inner tree
    let indice = 1;
    let binary_index = 0;

    // Construct hash path for 'Inner Tree'
    let n = this.InternalNodes[length - 1];
    this.HashPath.unshift(n.rightChild!.hash!);
    this.HashPath.unshift(n.leftChild!.hash!);
    const INNER = Math.log2(this.LeafNodes.length) - 1; 
    for (let i = INNER; i > 0; i--) {
        if (binary_array[binary_index] == '0') { 
          indice = 2 * indice + 1;
          n = this.InternalNodes[length - indice]; 
        }
        if (binary_array[binary_index] == '1') { 
          indice = 2 * indice;
          n = this.InternalNodes[length - indice]; 
        } 
        binary_index++;

        this.HashPath.unshift(n.rightChild!.hash!);
        this.HashPath.unshift(n.leftChild!.hash!);
    }

    // Construct 2D array for hash path
    const hashpath = [];
    while(this.HashPath.length) hashpath.push(this.HashPath.splice(0,2));

    return new HashPath(hashpath);
  }

  /**
   * Updates the tree with `value` at `index`. Returns the new tree root.
   */
  async updateElement(index: number, value: Buffer) {
    // Update the value at index
    this.LeafNodes[index].value = value;

    // Reconstruct the merkle root
    this.root = await this.constructMerkleTree(this.LeafNodes, this.LeafNodes.length, 0); 
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