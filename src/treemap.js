const d3v4 = require('./d3.v4')

import './treemap.css';
 
let d3 = d3v4;

const default_options = {
    showSubHeaders: {
        section: "Data",
        type: "boolean",
        label: "Show Sub Headers",
        default: "true"
    },
    numberOfLevels: {
        section: "Data",
        type: "number",
        label: "Number of levels to show",
        default: 2
    },
    cellColor: {
        section: "Data",
        type: "array",
        display: "colors",
        label: "Color Palette - Razorhorse",
        default: ["#AA4436", "#AA5347", "#AA6258", "#AA7169", "#AA807A", "#AA8F8B", "#AA9E9C", "#AAADAD", "#AABCBE", "#AACBCF"]
    },
    breadcrumbs: {
        type: "array",
        default: [],
    },
    current_branch: {
        type: "number" // type doesn't matter...
    },
    color_range: {
        type: "array",
        label: "Color Range",
        display: "colors",
        default: ["#dd3333", "#80ce5d", "#f78131", "#369dc1", "#c572d3", "#36c1b3", "#b57052", "#ed69af"],
    }
}
  
var clickedOnce = false;
var timer;
var isZoomed = false

const formatValue = function(number) {
    return parseInt(number);
}

const convertQueryDatasetToTreeData = function(data, queryResponse) {
    var vis_data = [];
    data.forEach(d => {
        var row = {};
        var idx = 0;
        row['metadata'] = {};
        for (var [key, value] of Object.entries(d)) {
            row[key] = value.value;

            if (idx < queryResponse.fields.dimension_like.length) {
                var field_label = queryResponse.fields.dimension_like[idx].label_short;
            } else {
                var field_label = queryResponse.fields.measure_like[idx - queryResponse.fields.dimension_like.length].label_short;
            }

            if (typeof value.rendered !== 'undefined') {
                var render = value.rendered
            } else {
                var render = value.value
            }
            row['metadata'][key] = {
                label: field_label,
                rendered: render,
                links: value.links,
            }
            idx += 1;
        }
        vis_data.push(row);
    });
    return vis_data;
}

const getHierarchyNames = function(queryResponse) {
    var hierarchy_names = [];
    queryResponse.fields.dimension_like.forEach(d => {
        hierarchy_names.push(d.name);
    });
    return hierarchy_names;
}

const getMeasureNames = function(queryResponse) {
    var measures = [];
    queryResponse.fields.measure_like.forEach(d => {
        measures.push(d.name);
    })
    return measures;
}

const getNewConfigOptions = function(dimensions, measures) {

    var new_options = default_options;

    var size_by_options = [];
    for (var i = 0; i < measures.length; i++) {
        var option = {};
        option[measures[i].label] = measures[i].name;
        size_by_options.push(option);
    }
    //size_by_options.push({"Count of Rows (TBD)": "count_of_rows"});

    new_options["sizeBy"] = {
        section: "Data",
        type: "string",
        label: "Size By",
        display: "select",
        values: size_by_options,
        default: "0",
    }

    var color_by_options = [];
    for (var i = 0; i < dimensions.length; i++) {
        var option = {};
        option[dimensions[i].label] = dimensions[i].name;
        color_by_options.push(option)
    }
    // color_by_options.push({"Color by Value (TBD)": "color_by_value"});

    new_options["colorBy"] = {
        section: "Data",
        type: "string",
        label: "Color By",
        display: "select",
        values: color_by_options,
        default: "0",
    }

    return new_options;
}


const vis = {

    options: default_options,

    create: function(element, config) {
      this._svg = d3v4.select(element).append("svg");

      this.container = d3.select(element)
      .append("div")
      .attr("id", "treemapContainer")

      this.tooltip = d3.select(element)
      .append("div")
      .attr("class", "hidden")
      .attr("id", "tooltip")

    },

    // Render in response to the data or settings changing
    update: function(data, element, config, queryResponse, details, done) {

        // this.clearErrors();
        let d3 = d3v4;
        let that = this

        if (!handleErrors(this, queryResponse, {
            min_pivots: 0, max_pivots: 0,
            min_dimensions: 1, max_dimensions: undefined,
            min_measures: 1, max_measures: 1,
        })) return;        
    
        let width = element.clientWidth;
        let height = element.clientHeight;    

        const bounds = element.getBoundingClientRect()
        const chartCentreX = bounds.x + (bounds.width / 2);
        const chartCentreY = bounds.y + (bounds.height / 2);
    
        let measure = queryResponse.fields.measure_like[0];  
        let format = formatType(measure.value_format);      
        const number_of_headers = config.numberOfLevels;
        const dimensions = queryResponse.fields.dimension_like;
        const measures = queryResponse.fields.measure_like;

        // const new_options = getNewConfigOptions(dimensions, measures);
        // vis.trigger("registerOptions", new_options);

        const vis_data = convertQueryDatasetToTreeData(data, queryResponse);
        const hierarchy_names = getHierarchyNames(queryResponse);
        const measure_names = getMeasureNames(queryResponse);

        // console.log("config.color_range", config.color_range)
        const color_range = config.color_range;

        let color = d3.scaleOrdinal().range(color_range)
  
        data.forEach(function(row) {
            row.taxonomy = dimensions.map(function(dim) {return row[dim.name].value})
        });
        
        var current_branch = config.current_branch || undefined;

        let treemap = d3.treemap()
          .size([width, height-16])
          .tile(d3.treemapSquarify.ratio(1))
          .paddingOuter(1)
          .paddingTop(function(d) {
                    if (config.showSubHeaders) {
                        return d.depth < number_of_headers ? 16 : 0
                    } else {
                        return d.depth === 0 ? 16 : 0
                    }
          })
          .paddingInner(2)
          .round(true);
      
          const updateCurrentBranch = function(branch, keys) {
            if (keys.length === 0) {
                // returning final branch
                current_branch = branch;
            } else {
                var key = keys.shift();

                for (var value in branch.values) {
                    if (branch !== undefined) {
                        if (branch.values[value].key === key) {
                            branch = updateCurrentBranch(branch.values[value], keys);
                        }
                    }
                }
            };
        }

        const getTooltip = function(d) {
            // console.log("getTooltip", d)
            // console.log("hierarchy_names", hierarchy_names)
            // console.log("measures", measures)
            var dme
            if( d.data.data){
                dme = d.data.data
            }
            else{
                dme = d.data
            }

            console.log("dme", dme, d)

            var tiptext = "";
            if (d.height === 0) {
                let p = 0
                for (var prop in hierarchy_names) {
                    var metadata = dme[hierarchy_names[prop]];
                    console.log("0 metadata", metadata)
                    if( p > 0){
                        if(metadata !== null){
                            console.log("1 metadata", metadata)
                            if(metadata.value !== null){    
                                tiptext += metadata.value + " &#187; "; //<p><em>" + metadata.label + ":</em> 
                            }
                        }
                    }
                    p++
                }
                tiptext += '<br>'
                for (var measure in measures) {
                    var metadata = dme[measure_names[measure]];
                    console.log("2 metadata", metadata)
                    if(metadata.rendered !== null){
                        //<p><em>" + d.data.data.name + ":</em> <b>
                        tiptext += "<b>" + metadata.rendered + "</b></p>";
                    }                    
                }
            } else {
                // if(d.data.key == "null"){
                //     tiptext += "";
                // }else{
                //     tiptext += d.data.name;
                // }
                if(d.data.name !== "root"){
                    tiptext += d.data.name;
                }
               
                    
            };
            
            return tiptext;
        }

        const getSize = function(d) {
            if (config["sizeBy"] == "count_of_rows") {
                return !d.key ? 1 : 0;
            } else {
                let measure = config["sizeBy"];
                return parseFloat(d[measure]);    
            }
        }

        const getCellText = function(d) {
            var cell_string = ''

            if (d.depth === 0) {
                var display_value = formatValue(d.value);
                if (config.breadcrumbs.length === 0) {
                    cell_string = "One click to toogle filter, doubleclick to navigate, right click to open the drill down list from Looker"; 
                } else {
                    if(d.value == "null"){
                        cell_string = "";
                    }else{
                        cell_string = "&#171; "+ config.breadcrumbs.join(" – ") + " (" + display_value + ")";
                    }
                    
                }
                
            } else if (d.depth < number_of_headers && config.showSubHeaders) {
                display_value = formatValue(d.value);
                if (d.data.key == null) {
                    cell_string = '' ;
                } else {
                    if(d.data.key == "null"){
                        cell_string = "";
                    }else{
                        cell_string = getBoxTip(d) //"<div class='navigation'>&#187; "+ d.data.key + " (" + display_value + ")</div>";
                    }                    
                }
            } else if (d.height === 0) {
                if (config["sizeBy"] === "count_of_rows") {
                    cell_string = "1";
                } else {
                    cell_string = getBoxTip(d) //+'<br>' + d.data.metadata[config["sizeBy"]].rendered;                    
                }
            } 

            return cell_string
        }

        const getDivName = function(d){
            let divName;
            if(d.depth === 0 || d.depth === 1){
                divName = "textdivMenu"
            }
            else{
                divName = "textdiv"
            }
            return divName
        }

        const getBoxTip = function(d) {
            var dme
            if( d.data.data){
                dme = d.data.data
            }
            else{
                dme = d.data
            }

            console.log("dme", dme, d)

            var tiptext = "";
            if (d.height === 0) {
                let p = 0
                for (var prop in hierarchy_names) {
                    var metadata = dme[hierarchy_names[prop]];
                    console.log("0 metadata", metadata)
                    if( p > 0){
                        if(metadata !== null){
                            console.log("1 metadata", metadata)
                            if(metadata.value !== null){    
                                tiptext += metadata.value + " &#187; "; //<p><em>" + metadata.label + ":</em> 
                            }
                        }
                    }
                    p++
                }
                // tiptext += '<br>'
                // for (var measure in measures) {
                //     var metadata = dme[measure_names[measure]];
                //     console.log("2 metadata", metadata)
                //     if(metadata.rendered !== null){
                //         //<p><em>" + d.data.data.name + ":</em> <b>
                //         tiptext += "<b>" + metadata.rendered + "</b></p>";
                //     }                    
                // }
            } else {
                // if(d.data.key == "null"){
                //     tiptext += "";
                // }else{
                //     tiptext += d.data.name;
                // }
                if(d.data.name !== "root"){
                    tiptext += d.data.name;
                }
               
                    
            };
            
            return tiptext;
        }

        const createTreemap = function(data, vis) {
            
            let d3 = d3v4;

            var nested_data = d3.nest();
            dimensions.forEach(dim => 
                nested_data = nested_data.key(d => d[dim.name]));
            nested_data = nested_data.entries(data);
            nested_data = {
                "key": "root",
                "values": nested_data,
            }
           
            // var root = treemap(
            //     d3.hierarchy(nested_data, d => d.values)
            //         .sum(d => getSize(d))
            //         .sort(function(a, b) { return b.height - a.height || getSize(b) - getSize(a)} )
            // );

            let root = d3.hierarchy(burrow(data))
            .sum(function(d) { return ("data" in d) ? d.data[measure.name].value : 0; });
            treemap(root);

            const displayChart = function(d) {

                let svg = that._svg
                    .html("")
                    .attr("width", "100%")
                    .attr("height", "100%")
                    .append("g")
                    .attr("transform", "translate(0,16)");
            
                let breadcrumb = svg.append("text")
                    .attr("y", -5)
                    .attr("x", 4);
              
                //treemap(root);
                let cell = svg.selectAll(".node")
                    .data(root.descendants())
                    .enter()                    
                    .append("g")
                    .attr("transform", function(d) { return "translate(" + d.x0 + "," + d.y0 + ")"; })
                    .attr("class", function(d,i) { return "node depth-" + d.depth; })
                    .style("stroke-width", 1.5)
                    .style("cursor", "arrow")
                    
                    .on("click", function(d) {                        
                        if (clickedOnce) {
                            //run_on_double_click(d);
                        } else {
                            timer = setTimeout(function() {
                                run_on_simple_click(d);
                                }, 250);
                                clickedOnce = true;                        
                        }
                    })
                    .on("mouseenter", function(d) {
                        let ancestors = d.ancestors();
                        breadcrumb.text(ancestors.map(function(p) { return p.data.name }).slice(0,-1).reverse().join("-") + ": " + format(d.value));
                        svg.selectAll("g.node rect")
                        .style("stroke", null)
                        .filter(function(p) {
                            return ancestors.indexOf(p) > -1;
                        })
                        .style("stroke", function(p) {
                            let scale = d3.scaleLinear()
                            .domain([1,12])
                            .range([color(d.ancestors().map(function(p) { return p.data.name }).slice(-2,-1)),"#ddd"])
                            return "#fff";
                        });
                    })
                    .on("mouseover", function(d) {

                        var pageX = d3.event.pageX
                        var pageY = d3.event.pageY
                    
                        var xPosition = pageX;
                        var yPosition = pageY;

                        d3.select("#tooltip")
                            .style("left", xPosition + "px")
                            .style("top", yPosition + "px")                   
                            .html(getTooltip(d));

                        d3.select("#tooltip").classed("hidden", false)
                        d3.select(this).style('stroke', 'white');
                        d3.select(this).style('stroke-width', '6');

                    })
                    .on("mousemove", function() {
                        var xPosition = d3.event.pageX < chartCentreX ? d3.event.pageX : d3.event.pageX - 210
                        var yPosition = d3.event.pageY < chartCentreY ? d3.event.pageY : d3.event.pageY - 120

                        if (xPosition )
                        d3.select('#tooltip')
                            .style('left', xPosition + 'px')
                            .style('top', yPosition + 'px')    
                    })
                    .on("mouseout", function() {
                        d3.select("#tooltip").classed("hidden", true);
                        d3.select(this).style('stroke', 'black');
                        d3.select(this).style('stroke-width', '0');
                    })
                    .on('contextmenu', d => {
                        event.preventDefault();
                        // TODO: this should be based on the sizeBy measure
                        console.log("contextmenu", d)
                        let measure = measures[0].name
                        LookerCharts.Utils.openDrillMenu({
                            links: d.data.data[measure].links,
                            event: event
                        }) 
                    })
                    .on("mouseleave", function(d) {
                        breadcrumb.text("");
                        svg.selectAll("g.node rect")
                        .style("stroke", function(d) {
                            return null;
                        })
                    });
            
                    cell.append("rect")
                        .attr("id", function(d,i) { return "rect-" + i; })
                        .attr("width", function(d) { return d.x1 - d.x0; })
                        .attr("height", function(d) { return d.y1 - d.y0; })
                        .style("fill", function(d) {
                        if (d.depth == 0) return "none";
                        let scale = d3.scaleLinear()
                            .domain([1,6.5])
                            .range([color(d.ancestors().map(function(p) { 
                                return p.data.name 
                            }).slice(-2,-1)),"#ddd"])
                            return scale(d.depth);
                        })
                    // .append("xhtml:div")
                    //     .html(d => getCellText(d))
                    //     .attr("class", (d) => getDivName(d))
                        
                    cell.append("clipPath")
                        .attr("id", function(d,i) { return "clip-" + i; })
                        .append("use")
                        .attr("xlink:href", function(d,i) { return "#rect-" + i; });
            
                    let label = cell
                    .append("text")
                    .style("opacity", function(d) {
                        if (d.depth == 1) return 1;
                        return 0;
                    })
                    .attr("clip-path", function(d,i) { return "url(#clip-" + i + ")"; })
                    .attr("y", function(d) {
                        return d.depth == 1 ? "13" : "10";
                    })
                    .attr("x", 2)
                    .style("font-family", "Helvetica, Arial, sans-serif")
                    .style("fill", "white")
                    .style("overflow", "visible")
                    .style("display", "block")
                    .style("font-size", function(d) {
                        return d.depth == 1 ? "14px" : "10px";
                    })
                    .text(function(d) { 
                        return d.data.name == "root" ? "" : d.data.name; 
                    });
                
                function run_on_simple_click(d) { 
                            
                    console.log("simpleclick");

                    let data = ''
                    let filterLevel = ''

                    console.log("d", d)

                    if(d.depth === 4)
                    {
                        filterLevel = "taxonomy.sub_sector_level_3"
                        data = {
                            [filterLevel] : { value: d.data.data[filterLevel].value}
                        }
                    }
                    if(d.depth === 3)
                    {
                        filterLevel = "taxonomy.sub_sector_level_3"
                        data = {
                            [filterLevel] : { value: d.data.data[filterLevel].value}
                        }
                    }
                    if(d.depth === 2)
                    {
                        filterLevel = "taxonomy.sub_sector_level_4"
                        data = {
                            [filterLevel] : { value: d.data.name}
                        }
                    }
                    if(d.depth === 1)
                    {
                        filterLevel = "taxonomy.sub_sector_level_2"
                        data = {
                            [filterLevel] : { value: d.data.name}
                        }
                    }

                    if (details.crossfilterEnabled) {                                   
                        LookerCharts.Utils.toggleCrossfilter({row: data})
                    }         

                    clickedOnce = false;
                }
                                
                function run_on_double_click(d) {
                    clickedOnce = false;
                    clearTimeout(timer);         
                    console.log("d", d)
                    console.log("currentBranch", current_branch)
                    console.log("vis", vis.trigger("updateConfig", [{current_branch: d}]))    
                    console.log("currentBranch", current_branch)             
                    zoom(d)      
                }                    

                                
                function zoom(d) {
                    
                    console.log("zoom", d)

                    while (d.depth > 1) {
                        d = d.parent;
                    }

                    // root = treemap(d3.hierarchy(d.data, d => d.values)
                    //     .sum(d => getSize(d)))
                    
                    // updateCurrentBranch(nested_data, config.breadcrumbs.slice(0));
                    // root = treemap(d3.hierarchy(current_branch, d => d.values)
                    //            .sum(d => getSize(d)))
                    // displayChart(root);

                    
                    // if (d.depth === 0) {
                    //     if (config.breadcrumbs.length === 0) {
                    //         // zoom cancelled, already at root node
                    //     } else {
                    //         config.breadcrumbs.pop();
                    //         // zoom up
                    //         updateCurrentBranch(nested_data, config.breadcrumbs.slice(0));
        
                    //         root = treemap(d3.hierarchy(current_branch, d => d.values)
                    //             .sum(d => getSize(d)))
                    //         displayChart(root);
                    //     }
                    // } else {
                    //     while (d.depth > 1) {
                    //         d = d.parent;
                    //     }
                    //     if (d.data.key != null) {
                    //         config.breadcrumbs.push(d.data.key);
                    //         // zoom down
                                                   
                    //     }
                    //     root = treemap(d3.hierarchy(d.data, d => d.values)
                    //             .sum(d => getSize(d))
                    //         );                                
                    //         displayChart(root);     
                    // }
                }

            }

            displayChart(root);
        }

        createTreemap(data, vis, data);

        function burrow(table) {
            console.log("burrow", table)
            // create nested object
            let obj = {};
            table.forEach(function(row) {
                // start at root
                let layer = obj;
        
                // create children as nested objects
                row.taxonomy.forEach(function(key) {
                    layer[key] = key in layer ? layer[key] : {};
                    layer = layer[key];
                });
                layer.__data = row;
                });
        
                // recursively create children array
                let descend = function(obj, depth) {
                let arr = [];
                depth = depth || 0;
                for (let k in obj) {
                    if (k == "__data") { continue; }
                    let child = {
                    name: k,
                    depth: depth,
                    children: descend(obj[k], depth+1)
                    };
                    if ("__data" in obj[k]) {
                    child.data = obj[k].__data;
                    }
                    arr.push(child);
                }
                return arr;
            };
    
            // use descend to create nested children arrys
            return {
                name: "root",
                children: descend(obj, 1),
                depth: 0
            }
        };    
    }
}

looker.plugins.visualizations.add(vis);

function formatType(valueFormat) {
    if (typeof valueFormat != "string") {
      return function (x) {return x}
    }
    let format = ""
    switch (valueFormat.charAt(0)) {
      case '$':
        format += '$'; break
      case '£':
        format += '£'; break
      case '€':
        format += '€'; break
    }
    if (valueFormat.indexOf(',') > -1) {
      format += ','
    }
    let splitValueFormat = valueFormat.split(".")
    format += '.'
    format += splitValueFormat.length > 1 ? splitValueFormat[1].length : 0
  
    switch(valueFormat.slice(-1)) {
      case '%':
        format += '%'; break
      case '0':
        format += 'f'; break
    }
    return d3.format(format)
}
  
  function handleErrors(vis, resp, options) {
    function messageFromLimits(min, max, field) {
      let message = "You need " + min
      if (max) {
        message += " to " + max
      }
      message += " " + field
      return message
    }
  
    if ((resp.fields.pivots.length < options.min_pivots) ||
        (resp.fields.pivots.length > options.max_pivots)) {
      let message
      vis.addError({
        group: "pivot-req",
        title: "Incompatible Pivot Data",
        message: messageFromLimits(options.min_pivots, options.max_pivots, "pivots"),
      });
      return false;
    } else {
      vis.clearErrors("pivot-req");
    }
  
    if ((resp.fields.dimensions.length < options.min_dimensions) ||
        (resp.fields.dimensions.length > options.max_dimensions)) {
      vis.addError({
        group: "dim-req",
        title: "Incompatible Dimension Data",
        message: messageFromLimits(options.min_dimensions, options.max_dimensions, "dimensions"),
      });
      return false;
    } else {
      vis.clearErrors("dim-req");
    }
  
    if ((resp.fields.measure_like.length < options.min_measures) ||
        (resp.fields.measure_like.length > options.max_measures)) {
      vis.addError({
        group: "mes-req",
        title: "Incompatible Measure Data",
        message: messageFromLimits(options.min_measures, options.max_measures, "measures"),
      });
      return false;
    } else {
      vis.clearErrors("mes-req");
    }
    return true;
}

