const d3 = require('./d3loader')

import './treemap.css';

const defaultHeaderColor = "#f0f0f0";
const defaultCellColor = "#b3b3b3";

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
};

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
        this.style = document.createElement('style');
        document.head.appendChild(this.style);

        this.container = d3.select(element)
            .append("div")
            .attr("id", "treemapContainer")

        this.tooltip = d3.select(element)
            .append("div")
            .attr("class", "hidden")
            .attr("id", "tooltip")
    },

    updateAsync: function(data, element, config, queryResponse, details, done) {

        this.clearErrors();

        const chartWidth = element.clientWidth;
        const chartHeight = element.clientHeight;
        
        const bounds = element.getBoundingClientRect()
        const chartCentreX = bounds.x + (bounds.width / 2);
        const chartCentreY = bounds.y + (bounds.height / 2);

        const headerColor = defaultHeaderColor;
        const number_of_headers = config.numberOfLevels;

        const dimensions = queryResponse.fields.dimension_like;
        const measures = queryResponse.fields.measure_like;
        
        const new_options = getNewConfigOptions(dimensions, measures);
        vis.trigger("registerOptions", new_options);

        const vis_data = convertQueryDatasetToTreeData(data, queryResponse);
        const hierarchy_names = getHierarchyNames(queryResponse);
        const measure_names = getMeasureNames(queryResponse);
        const colorScale = d3.scaleOrdinal().range(config.cellColor);  

        var current_branch = config.current_branch || undefined;
 
        var treemap = d3.treemap()
            .size([chartWidth, chartHeight-16])            
            .padding((d) => {
                return d.depth === 1 ? 2 : 0
            })
            .paddingTop((d) => {
                if (config.showSubHeaders) {
                    return d.depth < number_of_headers ? 16 : 0
                } else {
                    return d.depth === 0 ? 16 : 0
                }
            })
           
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

        const getSize = function(d) {
            if (config["sizeBy"] == "count_of_rows") {
                return !d.key ? 1 : 0;
            } else {
                let measure = config["sizeBy"];
                return parseFloat(d[measure]);    
            }
        }

        const getColor = function(d) {
            if (d.height === 0) {
                if (config.takeColorFromCellValue) {
                    return d.data[config["colorBy"]];
                } else {
                    return colorScale(d.data[config["colorBy"]]);
                }
            } else if (d.depth === 0) {
                return headerColor;
            } else {
                return defaultCellColor;
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

        const getBoxTip = function(d) {
            var tiptext = "";
            if (d.height === 0) {
                let p = 0
                for (var prop in hierarchy_names) {
                    var metadata = d.data.metadata[hierarchy_names[prop]];
                    if( p > 0){
                        if(metadata.rendered != null){
                            tiptext += " " + metadata.rendered + " &#187; "; //<p><em>" + metadata.label + ":</em> 
                        }
                    }
                    
                    p++
                }
                tiptext += '<br>'
                for (var measure in measures) {
                    var metadata = d.data.metadata[measure_names[measure]];
                    if(metadata.rendered != null){
                       // tiptext += "<p><em>" + metadata.label + ":</em></p>";
                    }                    
                }
            } else {
                if(d.data.key == "null"){
                    tiptext += "-";
                }else{
                    tiptext += d.data.key;
                }
                    
            };
            
            return tiptext;
        }

        const getTooltip = function(d) {
            var tiptext = "";
            if (d.height === 0) {
                let p = 0
                for (var prop in hierarchy_names) {
                    var metadata = d.data.metadata[hierarchy_names[prop]];
                    if( p > 0){
                        if(metadata.rendered != null){
                            tiptext += metadata.rendered + " &#187; "; //<p><em>" + metadata.label + ":</em> 
                        }
                    }
                    p++
                }
                tiptext += '<br>'
                for (var measure in measures) {
                    var metadata = d.data.metadata[measure_names[measure]];
                    if(metadata.rendered != null){
                        tiptext += "<p><em>" + metadata.label + ":</em> <b>" + metadata.rendered + "</b></p>";
                    }                    
                }
            } else {
                if(d.data.key == "null"){
                    tiptext += "";
                }else{
                    tiptext += d.data.key;
                }
                    
            };
            
            return tiptext;
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

        const createTreemap = function(data, vis) {
            
            var nested_data = d3.nest();
            dimensions.forEach(dim => 
                nested_data = nested_data.key(d => d[dim.name]));
            nested_data = nested_data.entries(data);
            nested_data = {
                "key": "root",
                "values": nested_data,
            }

            var root = treemap(
                d3.hierarchy(nested_data, d => d.values)
                  .sum(d => getSize(d))
                  .sort(function(a, b) { return b.height - a.height || getSize(b) - getSize(a)} )
            );

            const displayChart = function(d) {

                d3.select("#treemapSVG").remove();

                var svg = d3.select("#treemapContainer")
                            .append("svg")
                            .attr("id", "treemapSVG")
                            .attr("width", chartWidth)
                            .attr("height", chartHeight);

                var treemapArea = svg.append("g")
                    .datum(d)
                    .attr("class", "treemapArea");

                var treemapCells = treemapArea.selectAll("g")
                    .data(root.descendants())
                    .enter()

                console.log("Math.max(0, d.x1 - d.x0)", Math.max(0, d.x1 - d.x0))
                console.log("Math.max(0, d.y1 - d.y0)", Math.max(0, d.y1 - d.y0))

                let width;
                if(d.depth === 0){  
                    width = d.x0;
                }else{
                    width = 500;
                }

                
                treemapCells.append("rect")
                    .attr("x", d => d.x0)
                    .attr("y", d => d.y0)
                    .attr("width", d => Math.max(0, d.x1 - d.x0))
                    .attr("height", d => Math.max(0, d.y1 - d.y0))
                    .attr("fill", d => getColor(d))
                    .style('stroke', 'black')
                    .style('stroke-width', '0')
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
                    
                    // .on("dblclick", d => { 
                    //     clearTimeout(timeout)      
                    //     LookerCharts.Utils.openDrillMenu({
                    //         links: d.links,
                    //         event: event
                    //     }) 
                    // })

                    .on('click', d => {
                        
                        // event.preventDefault();

                         if (clickedOnce) {
                            run_on_double_click(d);

                        } else {
                            timer = setTimeout(function() {
                                run_on_simple_click(d);
                             }, 250);
                             clickedOnce = true;
                        }
                       
                    })
                    
                    // .on('contextmenu', d => {
                    //     event.preventDefault();
                    //      // TODO: this should be based on the sizeBy measure
                    //      let measure = measures[0].name

                    //      LookerCharts.Utils.openDrillMenu({
                    //          links: d.data.metadata[measure].links,
                    //          event: event
                    //      }) 
                    // })
                    
                   

                    treemapCells.append("foreignObject")
                        .attr("x", d => d.x0 + 3)
                        .attr("y", d => d.y0)
                        //Creaes the gap
                        .attr("width", d => Math.max(0, d.x1 - d.x0))
                        .attr("height", d => Math.max(0, d.y1 - d.y0))
                        .attr("fill", '#bbbbbb')
                        .attr("class", "foreignobj")
                        .attr("pointer-events", "none")
                        .attr("white-space", "nowrap")                            
                        .append("xhtml:div")
                        .html(d => getCellText(d))
                        .attr("class", (d) => getDivName(d))


                    function run_on_simple_click(d) { 
                                            
                        console.log("simpleclick");

                        let data = ''
                        let filterLevel = ''

                        if(d.depth === 4)
                        {
                            filterLevel = "taxonomy.sub_sector_level_3"
                            data = {
                                [filterLevel] : { value: d.data[filterLevel]}
                            }
                        }
                        if(d.depth === 3)
                        {
                            filterLevel = "taxonomy.sub_sector_level_3"
                            data = {
                                [filterLevel] : { value: d.data[filterLevel]}
                            }
                        }
                        if(d.depth === 2)
                        {
                            filterLevel = "taxonomy.sub_sector_level_4"
                            data = {
                                [filterLevel] : { value: d.data.key}
                            }
                        }
                        if(d.depth === 1)
                        {
                            filterLevel = "taxonomy.sub_sector_level_2"
                            data = {
                                [filterLevel] : { value: d.data.key}
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
                        if (d.depth === 0) {
                            if (config.breadcrumbs.length === 0) {
                                // zoom cancelled, already at root node
                            } else {
                                config.breadcrumbs.pop();
                                // zoom up
                                updateCurrentBranch(nested_data, config.breadcrumbs.slice(0));

                                root = treemap(d3.hierarchy(current_branch, d => d.values)
                                    .sum(d => getSize(d)))
                                displayChart(root);
                            }
                        } else {
                            while (d.depth > 1) {
                                d = d.parent;
                            }
                            if (d.data.key != null) {
                                config.breadcrumbs.push(d.data.key);
                                // zoom down
                                root = treemap(d3.hierarchy(d.data, d => d.values)
                                    .sum(d => getSize(d))
                                );                                
                                displayChart(root);                            
                            }
                        }
                    }
            }

            displayChart(root);
        }
        
        createTreemap(vis_data, vis);
        done();
    }
};

looker.plugins.visualizations.add(vis);