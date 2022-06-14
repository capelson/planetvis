HTMLWidgets.widget({
  name: "sankeyNetwork",

  type: "output",

  initialize: function (el, width, height) {
    d3.select(el).append("div").attr("id", 'append_scale').style("display", "flex").style("align-items", "center");

    d3.select(el).append("svg").style("width", "100%").style("height", "100%");

    return {
      sankey: d3.sankey(),
      x: null,
    };
  },

  resize: function (el, width, height, instance) {
    // with flexdashboard and slides
    //   sankey might be hidden so height and width 0
    //   in this instance re-render on resize
    if (d3.min(instance.sankey.size()) <= 0) {
      this.renderValue(el, instance.x, instance);
    }
  },

  renderValue: function (el, x, instance) {
    // save the x in our instance (for calling back from resize)
    instance.x = x;

    // alias sankey and options
    var sankey = instance.sankey;
    var options = x.options;

    // convert links and nodes data frames to d3 friendly format
    var links = HTMLWidgets.dataframeToD3(x.links);
    var nodes = HTMLWidgets.dataframeToD3(x.nodes);
    var stage_names = HTMLWidgets.dataframeToD3(x.options.stage_names);
    var items_list = options.top_producers_items
    // margin handling
    //   set our default margin to be 20
    //   will override with x.options.margin if provided
    var margin = { top: 20, right: 20, bottom: 20, left: 20 };

    //   go through each key of x.options.margin
    //   use this value if provided from the R side
    Object.keys(x.options.margin).map(function (ky) {
      if (x.options.margin[ky] !== null) {
        margin[ky] = x.options.margin[ky];
      }
    });

    // get the width and height
    var width = el.getBoundingClientRect().width - margin.right - margin.left;
    var height = el.getBoundingClientRect().height - margin.top - margin.bottom;

    var color = eval(options.colourScale);
    var node_to_zoom = x.options.zoomable_nodes;
    var color_node = function color_node(d) {
      if (d.group) {
        return color(d.group.replace(/ .*/, ""));
      } else {
        return "#cccccc";
      }
    };

    var color_link = function color_link(d) {
      if (d.group) {
        return color(d.group.replace(/ .*/, ""));
      } else {
        return "#000000";
      }
    };

    var opacity_link = function opacity_link(d) {
      if (d.group) {
        return 0.5;
      } else {
        return 0.2;
      }
    };

    var formatNumber = d3.format(",.0f"),
      format = function (d) {
        return formatNumber(d);
      };

    // create d3 sankey layout
    sankey
      .nodes(nodes)
      .links(links)
      .size([width, height])
      .nodeWidth(options.nodeWidth)
      .nodePadding(options.nodePadding)
      .sinksRight(options.sinksRight)
      .layout(options.iterations);

    // remove previously added scale
    const scale_div = document.getElementById("append_scale");
    scale_div.innerHTML = "";

    // select the svg element and remove existing children
    d3.select(el).select("svg").selectAll("*").remove();

    // remove any previously set viewBox attribute
    d3.select(el).select("svg").attr("viewBox", null);

    // append g for our container to transform by margin
    var svg = d3
      .select(el)
      .select("svg")
      .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // draw path
    var path = sankey.link();

    // draw links
    var link = svg
      .selectAll(".link")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("d", path)
      .style("stroke-width", function (d) {
        return Math.max(1, d.dy);
      })
      .style("fill", "none")
      .style("stroke", color_link)
      .style("stroke-opacity", opacity_link)
      .sort(function (a, b) {
        return b.dy - a.dy;
      })
      .on("mouseover", function (d) {
        d3.select(this).style("stroke-opacity", function (d) {
          return opacity_link(d) + 0.3;
        });
      })
      .on("mouseout", function (d) {
        d3.select(this).style("stroke-opacity", opacity_link);
      });

    // add backwards class to cycles
    link.classed("backwards", function (d) {
      return d.target.x < d.source.x;
    });

    svg
      .selectAll(".link.backwards")
      .style("stroke-dasharray", "9,1")
      .style("stroke", "#402");

    // draw nodes
    var node = svg
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", function (d) {
        return "translate(" + d.x + "," + d.y + ")";
      })
      .on("mouseover", null)
      .on("mouseover", function (d) {
        link
          .filter(function (d1, i) {
            return d.targetLinks.includes(d1) | d.sourceLinks.includes(d1);
          })
          .style("stroke-opacity", function (d) {
            return opacity_link(d) + 0.3;
          });
        Shiny.setInputValue("node_piechart", d.name, { priority: "event" });
      })
      .on("mouseout", function (d) {
        link
          .filter(function (d1, i) {
            return d.targetLinks.includes(d1) | d.sourceLinks.includes(d1);
          })
          .style("stroke-opacity", opacity_link);
      })
      .on("mousedown.drag", Shiny.onInputChange("node_zoom", null))
      .call(function () {
        manualLayout();
      });



    // note: u2192 is right-arrow
    link
      .append("title")
      .append("foreignObject")
      .append("xhtml:body")
      .html(function (d) {
        return (
          "<pre>" +
          d.source.name +
          " \u2192 " +
          d.target.name +
          "\n" +
          format(d.value) +
          " " +
          options.units +
          "</pre>"
        );
      });

    node
      .append("rect")
      .attr("height", function (d) {
        return d.dy;
      })
      .attr("width", sankey.nodeWidth())
      .style("fill", function (d) {
        return (d.color = color_node(d));
      })
      .style("stroke", function (d) {
        return d3.rgb(d.color).darker(2);
      })
      .style("opacity", 0.9)
      .append("title")
      .append("foreignObject")
      .append("xhtml:body")
      .html(function (d) {
        return (
          "<pre>" +
          d.name +
          ": " +
          "<br>" +
          format(d.value) +
          " " +
          options.units +
          "</pre>"
        );
      });



    d3.selectAll('.node rect')
      .on("click", function (d) {
        if (node_to_zoom.includes(d.name) & d.name != 'Milk') {
          d3.select(this).style("stroke-width", "6");
          Shiny.setInputValue("trade_info", null);
          Shiny.setInputValue("node_zoom", d.name, { priority: "event" });

        }
      });

    //Add cursor to nodes with zoom
    d3.select(el)
      .selectAll(".node rect")
      .filter(function (d, i) { return node_to_zoom.indexOf(d.name) >= 0 & d.name != 'Milk'; })
      .style("cursor", "s-resize")
      .style("stroke-width", "4");

    node
      .append("text")
      .attr("x", -6)
      .attr("y", function (d) {
        return d.dy / 2;
      })
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .attr("transform", null)
      .text(function (d) {
        return d.name;
      })
      .style("font-size", options.fontSize + "px")
      .style("font-family", options.fontFamily ? options.fontFamily : "inherit")
      .filter(function (d) {
        return d.x < width / 2 || !options.sinksRight;
      })
      .attr("x", 6 + sankey.nodeWidth())
      .attr("text-anchor", "start");

    // adjust viewBox to fit the bounds of our tree
    var s = d3.select(svg.node().parentNode);

    s.attr(
      "viewBox",
      [
        d3.min(
          s
            .selectAll("g")
            .nodes()
            .map(function (d) {
              return d.getBoundingClientRect().left;
            })
        ) -
        s.node().getBoundingClientRect().left -
        margin.right,
        d3.min(
          s
            .selectAll("g")
            .nodes()
            .map(function (d) {
              return d.getBoundingClientRect().top;
            })
        ) -
        s.node().getBoundingClientRect().top -
        margin.top,
        d3.max(
          s
            .selectAll("g")
            .nodes()
            .map(function (d) {
              return d.getBoundingClientRect().right;
            })
        ) -
        d3.min(
          s
            .selectAll("g")
            .nodes()
            .map(function (d) {
              return d.getBoundingClientRect().left;
            })
        ) +
        margin.left +
        margin.right,
        d3.max(
          s
            .selectAll("g")
            .nodes()
            .map(function (d) {
              return d.getBoundingClientRect().bottom;
            })
        ) -
        d3.min(
          s
            .selectAll("g")
            .nodes()
            .map(function (d) {
              return d.getBoundingClientRect().top;
            })
        ) +
        margin.top +
        margin.bottom,
      ].join(",")
    );


    //Change place of Animals node
    function manualLayout() {
      padding = 0;
      for (j = 0; j < nodes.length; j++) {
        pickNode = d3.selectAll(".node")._groups[0][j];
        d = nodes[j];

        if ((d.name === "Animals" & d.stage != 0 & options.data_source != 'Demo Resources/Outcomes') |
        (['Cattle', 'Pigs', 'Goat', 'Sheep', 'Poultry', 'Buffaloes', 'Other Species', 'Dairy', 'Meat', 'Eggs', 'Fats', 'Materials', 'Fifth-quarter', 'Honey', 'Aquatic Products'].includes(d.name))){

          d3.select(pickNode).attr(
            "transform",
            "translate(" +
            (d.x = d.x) +
            "," +
            (d.y = Math.max(0, Math.min(height - d.dy - padding))) +
            ")"
          );
          padding = padding + options.nodePadding + d.dy;

        }
      }

      sankey.relayout();
      link.attr("d", path);
    }

    if (options.units == 'kt' & options.data_source != 'Demo Resources/Outcomes') {
      const circledPlusUnicode = "\u24D8";

      const text = d3.selectAll('.node text')
        .filter(function (d) { return d.name.includes('Net') });

      text.append("tspan")
        .attr("class", "info-circle-trade")
        .style('font-size', options.fontSize * 1.2 + 'px')
        .style('font-weight', '900')
        .style("cursor", "pointer")
        .style('fill', '#6380ff')
        .attr('dy', -5)
        .text(circledPlusUnicode)
        .append("title")
        .append("foreignObject")
        .append("xhtml:body")
        .html(function (d) {
          return (
            'Click here to see more details'
          );
        });

      d3.selectAll(".info-circle-trade")
        .on("click", function (d) { Shiny.setInputValue("trade_info", { click: 1, node_name: d.name }, { priority: "event" }); });
    }

    if (options.region == "World") {
      d3.selectAll(".info-circle-trade").remove();
    }

    //--------------------------------------------------------------------------
    // LEGEND

    sankey_graph = document.getElementById("append_scale");

    //Calculate the scale
    let coef_refactor = 1 / window.devicePixelRatio;

    let node__height = svg.selectAll(".node rect")._groups[0][0].__data__.dy;
    let node__value = svg.selectAll(".node rect")._groups[0][0].__data__.value;

    let scale_value = 0.25 * (node__value * 100) / node__height;

    //1. Create scale
    let box_scale_div = document.createElement("div");
    box_scale_div.setAttribute("id", "scale_box");
    box_scale_div.setAttribute(
      "style",
      "margin-left: 20px; min-width: 40px; height: 25px; border: 1px solid; align-self: flex-end;"
    );

    let img_scale_div = document.createElement("div");
    img_scale_div.setAttribute("class", "img_scale");

    //1.2. Text element
    let tex_scale_div = document.createElement("div");
    tex_scale_div.setAttribute("id", "scale_text");
    tex_scale_div.setAttribute(
      "style",
      "float: left;  color: black; padding: 6px 0 7px 0; text-align: center; width: auto; height: 30px; padding: 7px; vertical-align: middle; font-size: 14px; font-weight: bold;"
    );

    let scale_text = document.createElement("p");
    if (options.units == 'kt') {
      scale_text.textContent =
        "25 px ~  " + "\n" + format(scale_value.toFixed(0)) + " kilotons (" + options.units + ") mass pa";

    }
    else if (options.units == 't') {
      scale_text.textContent =
        "25 px ~  " + "\n" + format(scale_value.toFixed(0)) + " tons (" + options.units + ") protein pa";
    }

    scale_text.setAttribute("style", "margin: 0px;");

    //2. Create zoom-info
    let box_zoom_div = document.createElement("div");
    box_zoom_div.setAttribute("id", "zoom_box");
    box_zoom_div.setAttribute(
      "style",
      "min-width: 40px; height: 25px; border: 5px solid; align-self: flex-end;"
    );

    //2.2. Text element
    let tex_zoom_div = document.createElement("div");
    tex_zoom_div.setAttribute("id", "zoom_text");
    tex_zoom_div.setAttribute(
      "style",
      "float: left;  color: black; padding: 6px 0 7px 0; text-align: center; width: auto; height: 30px; padding: 7px; vertical-align: middle; font-weight: bold; font-size: 14px;"
    );

    let zoom_text = document.createElement("p");
    zoom_text.textContent =
      "Click on bold for zoom";
    zoom_text.setAttribute("style", "margin: 0px;");

    //2. Mouseover info
    let info_icon_div = document.createElement("div");
    info_icon_div.setAttribute("id", "info_icon_legend");
    info_icon_div.setAttribute(
      "style",
      "min-width: 40px; height: 25px; background: grey; align-self: flex-end;"
    );

    //2.2. Text element
    let text_info_icon_div = document.createElement("div");
    text_info_icon_div.setAttribute("id", "info_icon_text");
    text_info_icon_div.setAttribute(
      "style",
      "color: black; padding: 6px 0 7px 0; text-align: center; width: auto; height: 30px; padding: 7px; vertical-align: middle; font-weight: bold; font-size: 14px;"
    );

    let info_icon_text = document.createElement("p");

    let info_icon = document.createElement("div");
    info_icon.setAttribute("class", 'info_icon_img');

    info_icon_text.textContent = "More info";
    //-------------------------------------------------------------

    //2. Mouseover info
    let mouseover_zoom_div = document.createElement("div");
    mouseover_zoom_div.setAttribute("id", "mouseover_box");
    mouseover_zoom_div.setAttribute(
      "style",
      "min-width: 40px; height: 25px; background: grey; align-self: flex-end;"
    );

    //2.2. Text element
    let tex_mouseover_div = document.createElement("div");
    tex_mouseover_div.setAttribute("id", "mouseover_text");
    tex_mouseover_div.setAttribute(
      "style",
      "float: left;  color: black; padding: 6px 0 7px 0; text-align: center; width: auto; height: 30px; padding: 7px; vertical-align: middle; font-weight: bold; font-size: 14px;"
    );

    let mouseover_text = document.createElement("p");
    mouseover_text.textContent =
      "Mouseover for values";
    mouseover_text.setAttribute("style", "margin: 0px;");

    //Append blocks
    sankey_graph.append(box_scale_div);
    sankey_graph.append(img_scale_div);
    sankey_graph.append(tex_scale_div);
    sankey_graph.append(box_zoom_div);
    sankey_graph.append(tex_zoom_div);
    sankey_graph.append(info_icon);
    sankey_graph.append(text_info_icon_div);
    sankey_graph.append(mouseover_zoom_div);
    sankey_graph.append(tex_mouseover_div);
    tex_scale_div.append(scale_text);
    tex_zoom_div.append(zoom_text);

    text_info_icon_div.append(info_icon_text);
    tex_mouseover_div.append(mouseover_text);

    if (options.region == "World") {
      nodes_with_top_prod = d3.selectAll('.node text')
        .filter(function (d) { return items_list.includes(d.name) & d.stage == 0; });

      nodes_with_top_prod.append("tspan")
        .attr("class", "info-top-producers")
        .style('font-size', options.fontSize * 1.2 + 'px')
        .style('font-weight', '900')
        .style("cursor", "pointer")
        .style('fill', '#6380ff')
        .attr('dy', -5)
        .text("\u24D8")
        .append("title")
        .append("foreignObject")
        .append("xhtml:body")
        .html(function (d) {
          return (
            'Click here to see more details'
          );
        });

      let non_zoomable_nodes_with_top_prod = items_list.filter(x => !node_to_zoom.includes(x) &
        nodes.map(function (d) { return d.name; }).includes(x));


      nodes_with_top_prod = d3.selectAll('.node text')
        .filter(function (d) { return non_zoomable_nodes_with_top_prod.includes(d.name) | d.name == 'Milk' | d.name == 'Buttermilk' });

      nodes_with_top_prod.append("tspan")
        .attr("class", "info-top-producers")
        .style('font-size', options.fontSize * 1.2 + 'px')
        .style('font-weight', '900')
        .style("cursor", "pointer")
        .style('fill', '#6380ff')
        .attr('dy', -5)
        .text("\u24D8")
        .append("title")
        .append("foreignObject")
        .append("xhtml:body")
        .html(function (d) {
          return (
            'Click here to see more details'
          );
        });

    }

   d3.selectAll(".info-top-producers")
      .on("click", function (d) { Shiny.setInputValue("top_producers", { click: 1, node_name: d.name }, { priority: "event" }); });

    var x_coord = nodes.map(function (d) {
      return d.x;
    });


    x_coord = [...new Set(x_coord)].sort();

    for (i = 0; i < x_coord.length; i++) {

      if (i == 0) {

        svg
          .append("text")
          .attr("transform", null)
          .attr("y", -10)
          .attr("text-anchor", "start")
          .attr("x", x_coord[i]) // shift along the x-axis
          .attr("style", "color: black; font-weight: bold; font-size: 14px;")
          .text(stage_names[i]['name']);
      }
      else {
        svg
          .append("text")
          .attr("transform", null)
          .attr("y", -10)
          .attr("text-anchor", "middle")
          .attr("x", x_coord[i] + options.nodeWidth / 2) // shift along the x-axis
          .attr("style", "color: black; font-weight: bold; font-size: 14px;")
          .text(stage_names[i]['name']);
      }

    }



     svg
      .selectAll(".link")
      .filter(function(d) {return ['Land', 'Water', 'Energy', 'Carbon',
                'Nutrients', 'Human capital', 'Financial capital', 'Livestock Herd'].includes(d.source.name) |
                ['Nutrition', 'Livelihoods', 'Climate', 'Biodiversity',
                'Pollution'].includes(d.target.name);})
      .remove();
  },
});
