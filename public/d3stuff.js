
var width = 960,
    height = 400,
    padding = 1.5, // separation between same-color nodes
    clusterPadding = 6, // separation between different-color nodes
    maxRadius = 100,
    minRadius = 15,
    originSize = 1;

var color = d3.scale.category10();

// The largest node for each cluster.
var clusters = [];
var thisNode, currentSpender;
var nodes = []; 

// Use the pack layout to initialize node positions.
d3.layout.pack()
    .sort(null)
    .size([width, height])
    .children(function(d) { return d.values; })
    .value(function(d) { return d.radius * d.radius; })
    .nodes({values: d3.nest()
      .key(function(d) { return d.cluster; })
      .entries(nodes)});

var force = d3.layout.force()
    .nodes(nodes)
    .size([width, height])
    .gravity(.02)
    .charge(0)
    .on("tick", tick)
    .start();

//Tooltip display (for when mouse hovers over node)
var tip = d3.tip()
  .attr('class', 'd3-tip')
  .offset([-10, 0])
  .html(function(d) {
    htmlText = "<strong>Address:</strong> <span style='color:orange'>" + d.address + "</span><br>" +
               "<strong>Amount:</strong> <span style='color:orange'>" + d.utxo + "</span><br>"; 
    return htmlText;
  })

var svg = d3.select("#chart").append("svg")
    .attr("width", width)
    .attr("height", height);

svg.call(tip);

var node = svg.selectAll("circle")
    .data(nodes);

node.transition()
    .duration(750)
    .delay(function(d, i) { return i * 5; })
    .attrTween("r", function(d) {
      var i = d3.interpolate(0, d.radius);
      return function(t) { return d.radius = i(t); };
    });

function tick(e) {
  node
      .each(cluster(10 * e.alpha * e.alpha))
      .each(collide(.5))
      .attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; });
}

// Move d to be adjacent to the cluster node.
function cluster(alpha) {
  return function(d) {
    var cluster = clusters[d.cluster];
    if (cluster === d) return;
    var x = d.x - cluster.x,
        y = d.y - cluster.y,
        l = Math.sqrt(x * x + y * y),
        r = d.radius + cluster.radius;
    if (l != r) {
      l = (l - r) / l * alpha;
      d.x -= x *= l;
      d.y -= y *= l;
      cluster.x += x;
      cluster.y += y;
    }
  };
}

// Resolves collisions between d and all other circles.
function collide(alpha) {
  var quadtree = d3.geom.quadtree(nodes);
  return function(d) {
    var r = d.radius + maxRadius + Math.max(padding, clusterPadding),
        nx1 = d.x - r,
        nx2 = d.x + r,
        ny1 = d.y - r,
        ny2 = d.y + r;
    quadtree.visit(function(quad, x1, y1, x2, y2) {
      if (quad.point && (quad.point !== d)) {
        var x = d.x - quad.point.x,
            y = d.y - quad.point.y,
            l = Math.sqrt(x * x + y * y),
            r = d.radius + quad.point.radius + (d.cluster === quad.point.cluster ? padding : clusterPadding);
        if (l < r) {
          l = (l - r) / l * alpha;
          d.x -= x *= l;
          d.y -= y *= l;
          quad.point.x += x;
          quad.point.y += y;
        }
      }
      return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
    });
  };
}

//Calls back the # of UTXOs that haven't been claimed by a recipient already
function totalNodeUnspent(inputAddress, callback) {
    var leftover = 0.0;
    nodes.forEach(function(node) {
        if(node.type === "recipient") {
            node.inbounds.forEach(function(inbound) {
                leftover -= parseFloat(inbound.amount);
            });
        } 
        leftover += parseFloat(node.utxo);

    });
    callback(leftover);
}


//Updates change node address and ensures it is color-filled properly
function updateChangeNode(newAddress, doIOwn, callback){
     var index = idxOfAttr(nodes, 'type', 'change');
     if (index > -1) {
        nodes[index].address = newAddress;
        nodes[index].isMine = doIOwn;
        d3.selectAll("svg").selectAll("circle")
        .style("fill", function(d) { 
            if(d.isMine) return color(d.cluster);
            else if (d.parent > -1 && nodes[d.parent].isMine) return color(nodes[d.parent].cluster);
            else return "white";
        });
        callback(true); return;
     }
    callback(false);
}

//Increase (or decrease) node radius, for visual feedback
function addToNodeSize(nid, amount){
     amount = parseFloat(amount.toFixed(8));
     var index = idxOfAttr(nodes, 'nodeID', nid);
     if (index > -1) {
        nodes[index].utxo = parseFloat(nodes[index].utxo) + amount;
        nodes[index].radius = Math.max(minRadius, (nodes[index].utxo / originSize * maxRadius));
        d3.selectAll("svg").selectAll("circle")
        .attr({r: function(d) { return(d.radius); },
                cx: function(d) { return(d.x); },
                cy: function(d) { return(d.y); },
              });
     }
}

//Call back a list of all nodes with inputAddress as their node.address
function allAddressNodes(inputAddress, callback){
    var resultArr = [];
    for(var i = 0; i < nodes.length; i += 1) {
            if(nodes[i].address === inputAddress) {
                resultArr.push(nodes[i]);
            }
    }
    resultArr.forEach(function(result) {
        console.log("RESULT : " + result.nodeID);
    });
    callback(resultArr);
}

//Update recipient address data when satoshis are sent to it
function receipt(targetAddress, parentNID, receiveAmount) {
     var keepPaying = false;
     receiveAmount = parseFloat(receiveAmount);
     var index = idxOfAttr(nodes, 'address', targetAddress);

     addToNodeSize(parentNID, -receiveAmount);
     addToNodeSize(nodes[index].nodeID, receiveAmount);

     var thisReceipt = { parent: parentNID, amount: receiveAmount }
     nodes[index].inbounds.push(thisReceipt);

     d3.selectAll("svg").selectAll("circle")
        .style("fill", function(d) { 
            if(d.parent >= 0) {
             var parIdx = idxOfAttr(nodes, 'nodeID', d.parent); 
             var clustIdx = idxOfAttr(clusters, 'address', nodes[parIdx].address);
             return color(clustIdx);
            }
            else if(d.isMine) return color(d.cluster);
            else return "white";
        });


     doMagic();
}

//Return index of first element in clusters[] which is undefined (to ensure no index problems occur)
function earliestUndefinedCluster(){
    var i = 0;
    while (i < clusters.length) {
        if(typeof clusters[i] == 'undefined') return i;
        i++;
    }
    return i;
}

//Add new node to graph
function addnode(inputAddress, typeOfNode, size, isItMine, parentNID) {
      size = parseFloat(size.toFixed(8))
      parentNID = parentNID || -1;
      parentNID = parseInt(parentNID);
      var thisCluster = idxOfAttr(clusters, 'address', inputAddress);
      if (thisCluster < 0) thisCluster = earliestUndefinedCluster();
      var stillIsOrigin = false; 
      if(typeOfNode === "origin") {
            stillIsOrigin = true; 
            originSize = size;
      }
      d = {cluster: thisCluster, nodeID: nodes.length, utxo: size, radius: Math.max(minRadius, (size / originSize * maxRadius)), address: inputAddress, type: typeOfNode, stillOrigin: stillIsOrigin, setAsideFee: 0.0, isMine: isItMine, parent: parentNID, inbounds: []};
      nodes.push(d);
      if (thisCluster === clusters.length) clusters.push(d);
      if (!clusters[thisCluster] || (size > clusters[thisCluster].radius)) clusters[thisCluster] = d;
      node = node.data(nodes);
      node.enter().append("circle")
        .style("fill", function(d) { 
            if(d.isMine === true) return color(d.cluster);
            else return "white";
        })
        .style('stroke', function(d) { 
            return color(d.cluster);
        }).style('stroke-width', '3')
        .attr({r: function(d) { return(d.radius); },
          cx: function(d) { return(d.x); },
          cy: function(d) { return(d.y); },
        })
      .on('click', function(d) {
        if(d.type === "origin") {
            if(d.isMine) {
                currentSpender = d;
                totalNodeUnspent(d.address, function(i){
                    $( "#dialog-form" ).dialog('option', 'title', ("Direct coinflow for " + d.address.toString()) )
                    .data('addressTotal', i)
                    .data('nid', d.nodeID)
                    .dialog('open');
                });
                updateWhatsLeft();
            } else {
                var attemptAtPrivateKey = prompt("Currently your wallet does not contain the private key corresponding to this address. If you would like to spend from it, please input the private key below.");
                socket.emit('tryToMatchPrivate', d.address, attemptAtPrivateKey);
            }
        }
      })
      .on('mouseover', tip.show)
      .on('mouseout', tip.hide)
        .call(force.drag);
      force.start();
}

