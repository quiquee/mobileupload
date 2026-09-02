// Port of describe-images.py's ui_workflow_to_api_prompt()/find_node_id_by_class_type(),
// which converts a ComfyUI UI-export workflow (nodes/links) into the flat
// {node_id: {class_type, inputs}} shape the /api/prompt endpoint expects.
//
// Best-effort: linked inputs are resolved via the links table; widget inputs are
// taken from widgets_values_named as-is, dots included -- e.g. TextGenerate's
// server-side schema actually requires the literal input name
// "sampling_mode.temperature", confirmed (in the Python original) via a failed
// job's node_errors. Do not "clean up" those dotted keys.

function uiWorkflowToApiPrompt(uiWorkflow) {
  const linksById = new Map();
  for (const link of uiWorkflow.links || []) {
    linksById.set(link[0], link);
  }

  const apiPrompt = {};
  for (const node of uiWorkflow.nodes) {
    const nodeType = node.type;
    if (nodeType === 'MarkdownNote' || nodeType === 'Note' || nodeType === 'Reroute') {
      continue;
    }

    const nodeId = String(node.id);
    const inputs = {};

    for (const nodeInput of node.inputs || []) {
      const linkId = nodeInput.link;
      if (linkId === null || linkId === undefined) continue;
      const link = linksById.get(linkId);
      if (!link) continue;
      const [, originNodeId, originSlot] = link;
      inputs[nodeInput.name] = [String(originNodeId), originSlot];
    }

    for (const [key, value] of Object.entries(node.widgets_values_named || {})) {
      if (!(key in inputs)) inputs[key] = value;
    }

    apiPrompt[nodeId] = {
      class_type: nodeType,
      inputs,
      _meta: { title: node.title || nodeType }
    };
  }

  return apiPrompt;
}

function findNodeIdByClassType(apiPrompt, classType) {
  for (const [nodeId, node] of Object.entries(apiPrompt)) {
    if (node.class_type === classType) return nodeId;
  }
  return null;
}

module.exports = { uiWorkflowToApiPrompt, findNodeIdByClassType };
