/**
 * Room EQ - Visual Pipeline Editor
 * MVP 2: Filter editing (add/edit/delete)
 */

let DSP;
let selectedNode = undefined;
let selectedContextNode = undefined;
let lanes = [];

const nodeWidth = 120;
const nodeHeight = 80;
const nodeSpacing = 20;
const laneHeight = 120;

/**
 * Initialize the Room EQ page
 */
export async function roomOnLoad() {
    console.log('Room EQ: Initializing...');
    
    // Get DSP instance from parent
    DSP = window.parent.DSP;
    
    if (!DSP || !DSP.connected) {
        showError('Not connected to DSP. Please connect from the Connections page.');
        return;
    }
    
    try {
        await DSP.downloadConfig();
        await renderPipeline();
        console.log('Room EQ: Initialized successfully');
    } catch (error) {
        console.error('Room EQ: Initialization error', error);
        showError('Error loading DSP configuration: ' + error.message);
    }
}

/**
 * Render the complete pipeline with lanes
 */
async function renderPipeline() {
    const editor = document.getElementById('editor');
    if (!editor) {
        console.error('Room EQ: Editor element not found');
        return;
    }
    
    editor.innerHTML = '';
    lanes = [];
    
    // Get linearized channel data
    const channels = await DSP.linearizeConfig();
    const channelCount = channels.length;
    
    console.log(`Room EQ: Rendering ${channelCount} channels`);
    
    // Create lanes
    for (let channelNo = 0; channelNo < channelCount; channelNo++) {
        const lane = createLane(channelNo, channels[channelNo]);
        editor.appendChild(lane);
        lanes.push(lane);
    }
}

/**
 * Create a single lane (channel row)
 */
function createLane(channelNo, components) {
    const lane = document.createElement('div');
    lane.className = 'lane';
    lane.setAttribute('data-channel', channelNo);
    lane.style.height = laneHeight + 'px';
    
    // Lane label
    const label = document.createElement('div');
    label.className = 'laneLabel';
    label.textContent = `Channel ${channelNo}`;
    lane.appendChild(label);
    
    // Container for nodes
    const nodeContainer = document.createElement('div');
    nodeContainer.className = 'nodeContainer';
    lane.appendChild(nodeContainer);
    
    // Create nodes for each component
    let xPos = 10;
    const nodes = [];
    
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        const node = createNode(component, channelNo, xPos);
        nodeContainer.appendChild(node);
        nodes.push(node);
        xPos += nodeWidth + nodeSpacing;
    }
    
    // Draw wires between consecutive nodes
    requestAnimationFrame(() => {
        drawWires(nodeContainer, nodes);
    });
    
    return lane;
}

/**
 * Create a node element for a component
 */
function createNode(component, channelNo, xPos) {
    const node = document.createElement('div');
    node.className = 'node';
    node.setAttribute('data-type', component.type);
    node.setAttribute('data-channel', channelNo);
    node.style.left = xPos + 'px';
    node.style.width = nodeWidth + 'px';
    node.style.height = nodeHeight + 'px';
    
    // Store filter name if it's a filter node
    if (component.type === 'filter') {
        const filterName = Object.keys(component).find(k => k !== 'type');
        if (filterName) {
            node.setAttribute('data-filter-name', filterName);
        }
    }
    
    // Node header
    const header = document.createElement('div');
    header.className = 'nodeHeader';
    header.textContent = component.type.toUpperCase();
    node.appendChild(header);
    
    // Node content
    const content = document.createElement('div');
    content.className = 'nodeContent';
    content.innerHTML = formatNodeContent(component);
    node.appendChild(content);
    
    // Add connectors
    if (component.type !== 'input') {
        const connectorLeft = document.createElement('div');
        connectorLeft.className = 'connector left';
        node.appendChild(connectorLeft);
    }
    
    if (component.type !== 'output') {
        const connectorRight = document.createElement('div');
        connectorRight.className = 'connector right';
        node.appendChild(connectorRight);
    }
    
    // Add event handlers for filter nodes
    if (component.type === 'filter') {
        node.style.cursor = 'pointer';
        
        // Left click to edit
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            const filterName = node.getAttribute('data-filter-name');
            openFilterEditor(filterName, channelNo);
        });
        
        // Right click for context menu
        node.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showNodeContextMenu(node, e.clientX, e.clientY);
        });
    }
    
    // Add context menu for mixer nodes (add-only)
    if (component.type === 'mixer') {
        node.style.cursor = 'context-menu';
        
        node.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showNodeContextMenu(node, e.clientX, e.clientY);
        });
    }
    
    return node;
}

/**
 * Format node content based on component type
 */
function formatNodeContent(component) {
    switch (component.type) {
        case 'input':
        case 'output':
            return `
                <div class="nodeDetail">${component.device.device}</div>
                <div class="nodeDetail small">${component.device.format}</div>
            `;
        
        case 'mixer':
            const sourceCount = component.sources.length;
            return `
                <div class="nodeDetail">${sourceCount} source${sourceCount !== 1 ? 's' : ''}</div>
            `;
        
        case 'filter':
            const filterName = Object.keys(component).find(k => k !== 'type');
            if (!filterName) return '<div class="nodeDetail">Unknown</div>';
            
            const filter = component[filterName];
            const params = filter.parameters;
            
            if (filter.type === 'Biquad') {
                let details = `<div class="nodeDetail">${filterName}</div>`;
                details += `<div class="nodeDetail small">${params.type}</div>`;
                if (params.freq) details += `<div class="nodeDetail small">${params.freq} Hz</div>`;
                if (params.gain !== undefined) details += `<div class="nodeDetail small">${params.gain} dB</div>`;
                return details;
            } else if (filter.type === 'Gain') {
                return `
                    <div class="nodeDetail">${filterName}</div>
                    <div class="nodeDetail small">Gain: ${params.gain} dB</div>
                `;
            } else if (filter.type === 'Conv') {
                return `
                    <div class="nodeDetail">${filterName}</div>
                    <div class="nodeDetail small">Convolution</div>
                `;
            } else {
                return `
                    <div class="nodeDetail">${filterName}</div>
                    <div class="nodeDetail small">${filter.type}</div>
                `;
            }
        
        default:
            return '<div class="nodeDetail">Unknown</div>';
    }
}

/**
 * Draw wires between consecutive nodes
 */
function drawWires(container, nodes) {
    // Remove existing wires
    const existingWires = container.querySelectorAll('.wire');
    existingWires.forEach(wire => wire.remove());
    
    // Draw wire between each consecutive pair
    for (let i = 0; i < nodes.length - 1; i++) {
        const fromNode = nodes[i];
        const toNode = nodes[i + 1];
        
        const wire = createWire(fromNode, toNode);
        container.appendChild(wire);
    }
}

/**
 * Create a wire (connection line) between two nodes
 */
function createWire(fromNode, toNode) {
    const wire = document.createElement('div');
    wire.className = 'wire';
    
    // Get connector positions
    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();
    const containerRect = fromNode.parentElement.getBoundingClientRect();
    
    // Calculate positions relative to container
    const fromX = fromRect.right - containerRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - containerRect.top;
    const toX = toRect.left - containerRect.left;
    const toY = toRect.top + toRect.height / 2 - containerRect.top;
    
    // Calculate wire geometry
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    
    // Position and style the wire
    wire.style.left = fromX + 'px';
    wire.style.top = fromY + 'px';
    wire.style.width = length + 'px';
    wire.style.transform = `rotate(${angle}deg)`;
    
    return wire;
}

/**
 * Show an error message to the user
 */
function showError(message) {
    const editor = document.getElementById('editor');
    if (editor) {
        editor.innerHTML = `
            <div class="error">
                <h3>Error</h3>
                <p>${message}</p>
            </div>
        `;
    }
}

/**
 * Refresh the pipeline view (for future use)
 */
export async function refreshPipeline() {
    await DSP.downloadConfig();
    await renderPipeline();
}

/**
 * Open filter editor for a filter node
 */
function openFilterEditor(filterName, channelNo) {
    if (!filterName) return;
    
    console.log(`Opening filter editor for: ${filterName} on channel ${channelNo}`);
    
    const modal = document.getElementById('filterEditorModal');
    const modalTitle = document.getElementById('modalTitle');
    const filterEditorContent = document.getElementById('filterEditorContent');
    
    if (!modal || !modalTitle || !filterEditorContent) {
        console.error('Room EQ: Filter editor modal elements not found');
        return;
    }
    
    // Clear previous content
    filterEditorContent.innerHTML = '';
    modalTitle.textContent = `Edit Filter: ${filterName}`;
    
    // Create filter instance and load from DSP
    const filterInstance = new window.filter(DSP);
    filterInstance.loadFromDSP(filterName);
    filterInstance.createElementCollection(false);
    
    // Build editor UI
    const editorDiv = document.createElement('div');
    editorDiv.className = 'filterEditorPanel';
    
    // Filter type
    const typeRow = document.createElement('div');
    typeRow.className = 'editorRow';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = 'Filter Type:';
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(filterInstance.elementCollection.filterType);
    editorDiv.appendChild(typeRow);
    
    // Filter subtype (if applicable)
    if (filterInstance.elementCollection.filterSubType.childNodes.length > 0) {
        const subTypeRow = document.createElement('div');
        subTypeRow.className = 'editorRow';
        const subTypeLabel = document.createElement('span');
        subTypeLabel.textContent = 'Sub Type:';
        subTypeRow.appendChild(subTypeLabel);
        subTypeRow.appendChild(filterInstance.elementCollection.filterSubType);
        editorDiv.appendChild(subTypeRow);
    }
    
    // Parameters
    editorDiv.appendChild(filterInstance.elementCollection.peqParams);
    
    // Add to modal
    filterEditorContent.appendChild(editorDiv);
    
    // Setup close handlers
    const closeBtn = document.getElementById('closeFilterEditor');
    const closeHandler = async () => {
        modal.style.display = 'none';
        await DSP.uploadConfig();
        await refreshPipeline();
        closeBtn.removeEventListener('click', closeHandler);
    };
    closeBtn.addEventListener('click', closeHandler);
    
    // Close on outside click
    modal.addEventListener('click', function outsideClickHandler(e) {
        if (e.target === modal) {
            closeHandler();
            modal.removeEventListener('click', outsideClickHandler);
        }
    });
    
    // Show modal
    modal.style.display = 'flex';
}

/**
 * Show context menu for node operations
 */
function showNodeContextMenu(node, x, y) {
    const contextMenu = document.getElementById('nodeContextMenu');
    if (!contextMenu) return;
    
    selectedContextNode = node;
    
    // Show/hide menu items based on node type
    const nodeType = node.getAttribute('data-type');
    const deleteItem = document.getElementById('ctxDelete');
    
    if (deleteItem) {
        // Only show delete for filter nodes
        deleteItem.style.display = nodeType === 'filter' ? 'flex' : 'none';
    }
    
    // Position context menu
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    
    // Close on outside click
    const closeHandler = (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
            document.removeEventListener('click', closeHandler);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
    }, 0);
}

/**
 * Add a new filter after the selected node
 */
export async function addFilterAfter() {
    if (!selectedContextNode) return;
    
    const channelNo = parseInt(selectedContextNode.getAttribute('data-channel'));
    const nodeType = selectedContextNode.getAttribute('data-type');
    const contextMenu = document.getElementById('nodeContextMenu');
    contextMenu.style.display = 'none';
    
    try {
        // Create a new default filter
        const timestamp = Date.now().toString().substring(8);
        const filterName = `Filter_${timestamp}`;
        
        const newFilter = new window.filter(DSP);
        newFilter.setName(filterName);
        
        // Determine insertion position
        let insertIndex;
        const filterList = DSP.getChannelFiltersList(channelNo);
        
        if (nodeType === 'mixer') {
            // Insert at beginning (right after mixer)
            insertIndex = 0;
        } else if (nodeType === 'filter') {
            // Insert after the clicked filter
            const currentFilterName = selectedContextNode.getAttribute('data-filter-name');
            insertIndex = filterList.indexOf(currentFilterName) + 1;
        } else {
            console.error('Cannot add filter after node type:', nodeType);
            return;
        }
        
        // Add filter to DSP
        newFilter.loadToDSP(channelNo);
        
        // Reorder to insert at correct position
        const updatedFilterList = DSP.getChannelFiltersList(channelNo);
        const newFilterIndex = updatedFilterList.indexOf(filterName);
        
        if (newFilterIndex !== insertIndex) {
            // Move filter to correct position
            updatedFilterList.splice(newFilterIndex, 1);
            updatedFilterList.splice(insertIndex, 0, filterName);
            
            // Update pipeline
            const pipe = DSP.config.pipeline.find(p => p.type === "Filter" && p.channel === channelNo);
            if (pipe) {
                pipe.names = updatedFilterList;
            }
        }
        
        await DSP.uploadConfig();
        await refreshPipeline();
        
        console.log(`Added filter ${filterName} to channel ${channelNo} at position ${insertIndex} (after ${nodeType})`);
    } catch (error) {
        console.error('Error adding filter:', error);
        alert('Error adding filter: ' + error.message);
    }
}

/**
 * Delete the selected filter node
 */
export async function deleteSelectedFilter() {
    if (!selectedContextNode) return;
    
    const nodeType = selectedContextNode.getAttribute('data-type');
    if (nodeType !== 'filter') {
        console.error('Can only delete filter nodes');
        return;
    }
    
    const channelNo = parseInt(selectedContextNode.getAttribute('data-channel'));
    const filterName = selectedContextNode.getAttribute('data-filter-name');
    const contextMenu = document.getElementById('nodeContextMenu');
    contextMenu.style.display = 'none';
    
    if (!confirm(`Delete filter "${filterName}"?`)) {
        return;
    }
    
    try {
        // Remove filter from channel pipeline
        DSP.removeFilterFromChannelPipeline(filterName, channelNo);
        
        await DSP.uploadConfig();
        await refreshPipeline();
        
        console.log(`Deleted filter ${filterName} from channel ${channelNo}`);
    } catch (error) {
        console.error('Error deleting filter:', error);
        alert('Error deleting filter: ' + error.message);
    }
}

/**
 * Add a new filter to the beginning of a channel
 */
export async function addFilterToChannel(channelNo) {
    try {
        const timestamp = Date.now().toString().substring(8);
        const filterName = `Filter_${timestamp}`;
        
        const newFilter = new window.filter(DSP);
        newFilter.setName(filterName);
        newFilter.loadToDSP(channelNo);
        
        await DSP.uploadConfig();
        await refreshPipeline();
        
        console.log(`Added filter ${filterName} to channel ${channelNo}`);
    } catch (error) {
        console.error('Error adding filter:', error);
        alert('Error adding filter: ' + error.message);
    }
}
