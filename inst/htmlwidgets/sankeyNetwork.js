HTMLWidgets.widget({
  name: "sankeyNetwork",

  type: "output",

  initialize: function (el, width, height) {
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
        Shiny.setInputValue("node_piechart", d.name, {priority: "event"});
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
        if (node_to_zoom.includes(d.name)) {
          d3.select(this).style("stroke-width", "6");
          Shiny.setInputValue("trade_info", null);
          Shiny.setInputValue("node_zoom", d.name, {priority: "event"});

        }
      });
    /*
    const node_to_zoom = [
      "Apples and products",
      "Animals",
      "Pigmeat",
      "Bananas",
      "Barley and products",
      "Beans",
      "Meat",
      "Bovine Meat",
      "Cereals",
      "Citrus, Other",
      "Coconuts - Incl Copra",
      "Cropland Production",
      "Dates",
      "Fats",
      "Aquatic Products",
      "Fish, Seafood",
      "Fruits",
      "Fruits, Other",
      "Grapes and products (excl wine)",
      "Groundnuts",
      "Materials",
      "Lemons, Limes and products",
      "Maize and products",
      "Meat, Other",
      "Poultry Meat",
      "Mutton & Goat Meat",
      "Dairy",
      "Milk, whole fresh camel",
      "Milk, whole fresh cow",
      "Milk, whole fresh goat",
      "Milk, whole fresh sheep",
      "Millet and products",
      "Nuts and products",
      "Oats",
      "Offals, Edible",
      "Oilcrops",
      "Oilcrops, Other",
      "Olives (including preserved)",
      "Onions",
      "Oranges, Mandarines",
      "Other",
      "Palm kernels",
      "Peas",
      "Pineapples and products",
      "Plantains",
      "Potatoes and products",
      "Pulses",
      "Pulses, Other and products",
      "Rape and Mustardseed",
      "Rice and products",
      "Sesame seed",
      "Soyabeans",
      "Spices",
      "Spices, Other",
      "Starchy Roots",
      "Stimulants",
      "Sugar Crops",
      "Sunflower seed",
      "Tea (including mate)",
      "Tomatoes and products",
      "Treenuts",
      "Vegetables",
      "Vegetables, Other",
      "Wheat and products",
      "Yams",
      "Aquatic Products, Other",
      "Coffee and products",
      "Milk, whole fresh buffalo",
      "Rye and products",
      "Cereals, Other",
      "Cocoa Beans and products",
      "Grapefruit and products",
      "Pepper",
      "Pimento",
      "Sorghum and products",
      "Cassava and products",
      "Sweet potatoes",
      "Roots, Other",
      "Cloves",
      "Net Imports Harvest",
      "Net Exports Harvest",
      "Net Imports Primary",
      "Net Exports Primary",
      "Net Imports Goods",
      "Net Exports Goods",
      "Net Imports Food",
      "Net Exports Food",
      "Domestic Harvest Supply",
      'Transformed Food',
      'Alcoholic Beverages',
      'Vegetable Oils',
      'Sugar & Sweeteners',
      'Alcohol, Non-Food',
      'Beer',
      'Beverages, Alcoholic',
      'Beverages, Fermented',
      'Wine',
      'Honey',
      'Sugar (Raw Equivalent)',
      'Sugar non-centrifugal',
      'Sweeteners, Other',
      'Coconut Oil',
      'Cottonseed Oil',
      'Groundnut Oil',
      'Maize Germ Oil',
      'Oilcrops Oil, Other',
      'Olive Oil',
      'Palm Oil',
      'Palmkernel Oil',
      'Rape and Mustard Oil',
      'Ricebran Oil',
      'Sesameseed Oil',
      'Soyabean Oil',
      'Sunflowerseed Oil',
      'Milk, whole dried',
      'Milk, skimmed dried',
      'Cheese, buffalo milk',
      'Cheese, sheep milk',
      'Cheese, goat milk',
      'Casein',
      'Ice cream and edible ice',
      'Milk, products of natural constituents nes',
      'Milk, skimmed cow',
      'Milk, reconstituted',
      'Milk, skimmed buffalo',
      'Milk, skimmed sheep',
      'Milk, skimmed goat',
      'Whey, fresh', 'Whey, dry',
      'Whey, condensed', 'Milk, whole evaporated',
      'Milk, skimmed evaporated',
      'Milk, whole condensed',
      'Milk, skimmed condensed',
      'Yoghurt', 'Yoghurt, concentrated or not',
      'Buttermilk, curdled, acidified milk',
      'Milk, dry buttermilk',
      'Cheese, whole cow milk',
      'Cheese, skimmed cow milk',
      'Whey, cheese', 'Cheese, processed'
    ];*/

    //Add cursor to nodes with zoom
    d3.select(el)
      .selectAll(".node rect")
      .filter(function(d, i) { return node_to_zoom.indexOf( d.name ) >= 0; })
      .style("cursor", "s-resize")
      .style("stroke-width", "4");


    const node_to_zoom_without_border = [
      "Net Imports Harvest",
      "Net Import Primary"
    ];

    //Add cursor to nodes with zoom
    d3.select(el)
      .selectAll(".node rect")
      .filter(function (d) {
        return node_to_zoom_without_border.includes(d.name);
      })
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

    d3.select(el)
      .selectAll(".node rect")
      .filter(function (d, i) {
        return ["Human processed food", "Human raw food"].indexOf(d.name) >= 0;
      })
      .style("stroke", "#8EAF0C")
      .style("stroke-width", "3");

    d3.select(el)
      .selectAll(".node rect")
      .filter(function (d, i) {
        return (
          [
            "Fuels",
            "Consumer goods",
            "Industrial goods",
            "Drugs",
            "Edible oils and fats",
          ].indexOf(d.name) >= 0
        );
      })
      .style("stroke", "#000000")
      .style("stroke-width", "3");

    //Add titles to stages

    //Stage 1
    const productionNodes = ["Cropland Production", "Graizing", "Marine"];

    let group_1 = svg.selectAll(".node").filter(function (d) {
      return productionNodes.includes(d.name);
    });

    //Stage 2
    const processNodes = [
      "Processed",
      "By-product",
      "Industrial",
      "Seed",
      "Animal usable",
      "Crop Residues",
      "Loss",
      "Net Exports Crop",
    ];

    let group_2 = svg.selectAll(".node").filter(function (d) {
      return processNodes.includes(d.name);
    });
    /*
    if (group_2._groups[0].length !== 0) {
      let x_group_2 = group_2._groups[0][0].__data__.x;

      svg
        .append("text")
        .attr("transform", null)
        .attr("y", -10)
        .attr("x", x_group_2 - 25)
        .attr("style", "color: black; font-weight: bold;")
        .text("Processing Stage");
    }*/

    //Stage 3
    const animalNodes = ["Animals"];

    let group_3 = svg.selectAll(".node").filter(function (d) {
      return animalNodes.includes(d.name);
    });

    //Stage 4
    const goodsNodes = [
      "Human raw food",
      "Human processed food",
      "Alcoholic Beverages",
      "Consumer goods",
      "Industrial goods",
      "Tourists/refugee",
      "Fuels",
      "Drugs",
      "Edible oils and fats",
      "Net Exports Food",
      "Net Exports Goods",
    ];

    let group_4 = svg.selectAll(".node").filter(function (d) {
      return goodsNodes.includes(d.name);
    });
    /*
    if (group_4._groups[0].length !== 0) {
      var x_group_4 = group_4._groups[0][0].__data__.x;

      svg
        .append("text")
        .attr("transform", null)
        .attr("y", -10)
        .attr("x", x_group_4 - 25)
        .attr("style", "color: black; font-weight: bold;")
        .text("Goods Stage");
    }*/

    const cropNodes = [
      "Cereals",
      "Sugar Crops",
      "Fruits",
      "Oilcrops",
      "Starchy Roots",
      "Vegetables",
      "Other",
      "Barley and products",
      "Cereals, Other",
      "Maize and products",
      "Millet and products",
      "Oats",
      "Rice and products",
      "Rye and products",
      "Sorghum and products",
      "Wheat and products",
      "Apples and products",
      "Bananas",
      "Citrus, Other",
      "Dates",
      "Fruits, Other",
      "Grapefruit and products",
      "Grapes and products (excl wine)",
      "Lemons, Limes and products",
      "Oranges, Mandarines",
      "Pineapples and products",
      "Plantains",
      "Coconuts - Incl Copra",
      "Cottonseed",
      "Groundnuts",
      "Oilcrops, Other",
      "Olives (including preserved)",
      "Palm kernels",
      "Rape and Mustardseed",
      "Sesame seed",
      "Soyabeans",
      "Sunflower seed",
      "Beans",
      "Peas",
      "Pulses, Other and products",
      "Cloves",
      "Pepper",
      "Pimento",
      "Spices, Other",
      "Cassava and products",
      "Potatoes and products",
      "Roots, Other",
      "Sweet potatoes",
      "Yams",
      "Cocoa Beans and products",
      "Coffee and products",
      "Tea (including mate)",
      "Nuts and products",
      "Onions",
      "Tomatoes and products",
      "Vegetables, Other",
      "Pulses",
      "Stimulants",
      "Treenuts",
      "Spices",
    ];

    //Stage zoom/Cropland
    group_5 = svg.selectAll(".node").filter(function (d) {
      return cropNodes.includes(d.name);
    });
    /*
    if (group_1._groups[0].length !== 0 && group_5._groups[0].length == 0) {

      let x_group_1 = group_1._groups[0][0].__data__.x;

      svg
        .append("text")
        .attr("transform", null)
        .attr("y", -10)
        .attr("x", x_group_1 - 25)
        .attr("style", "color: black; font-weight: bold;")
        .text("Production Stage");
    }*/
    /*

    if (group_5._groups[0].length !== 0) {
      var x_group_5_array = [];

      for (i = 0; i < group_5._groups[0].length; i++) {
        //check if we already save the x coord

        if (!x_group_5_array.includes(group_5._groups[0][i].__data__.x)) {
          x_group_5_array.push(group_5._groups[0][i].__data__.x);
        }
      }

      svg
            .append("text")
            .attr("transform", null)
            .attr("y", -10)
            .attr("x", x_group_5_array.sort()[x_group_5_array.length - 1] - 30) // shift along the x-axis
            .attr("style", "color: black; font-weight: bold;")
            .text("Production Stage");
    }*/

    //Stage 4 - zoom
    const animalZoomNodes = [
      "Aquatic Animals, Others",
      "Aquatic Plants",
      "Aquatic Products",
      "Aquatic Products, Other",
      "Bacon and ham",
      "Beeswax",
      "Bovine Meat",
      "Bovine Meat",
      "Butter, Ghee",
      "Cephalopods",
      "Cheese",
      "Cream",
      "Crustaceans",
      "Dairy",
      "Demersal Fish",
      "Eggs",
      "Fat, buffaloes",
      "Fat, camels",
      "Fat, cattle",
      "Fat, goats",
      "Fat, liver prepared (foie gras)",
      "Fat, other animals",
      "Fat, other camelids",
      "Fat, pigs",
      "Fat, poultry",
      "Fat, sheep",
      "Fats",
      "Fish, Seafood",
      "Freshwater Fish",
      "Hides, buffalo, fresh",
      "Hides, cattle, fresh",
      "Honey",
      "Liver prep.",
      "Marine Fish, Other",
      "Materials",
      "Materials",
      "Meat",
      "Meat",
      "Meat nes",
      "Meat nes, preparations",
      "Meat, ass",
      "Meat, beef and veal sausages",
      "Meat, beef, dried, salted, smoked",
      "Meat, beef, preparations",
      "Meat, bird nes",
      "Meat, buffalo",
      "Meat, camel",
      "Meat, cattle",
      "Meat, cattle, boneless (beef & veal)",
      "Meat, chicken",
      "Meat, chicken, canned",
      "Meat, dried nes",
      "Meat, duck",
      "Meat, extracts",
      "Meat, game",
      "Meat, goat",
      "Meat, goose and guinea fowl",
      "Meat, homogenized preparations",
      "Meat, horse",
      "Meat, mule",
      "Meat, Other",
      "Meat, other rodents",
      "Meat, pig",
      "Meat, pig sausages",
      "Meat, pig, preparations",
      "Meat, pork",
      "Meat, rabbit",
      "Meat, sheep",
      "Meat, turkey",
      "Milk",
      "Milk, whole fresh buffalo",
      "Milk, whole fresh camel",
      "Milk, whole fresh cow",
      "Milk, whole fresh goat",
      "Milk, whole fresh sheep",
      "Molluscs, Other",
      "Mutton & Goat Meat",
      "Offals nes",
      "Offals, Edible",
      "Offals, edible, buffaloes",
      "Offals, edible, camels",
      "Offals, edible, cattle",
      "Offals, edible, goats",
      "Offals, horses",
      "Offals, liver chicken",
      "Offals, liver duck",
      "Offals, liver geese",
      "Offals, liver turkeys",
      "Offals, pigs, edible",
      "Offals, sheep,edible",
      "Pelagic Fish",
      "Pigmeat",
      "Poultry Meat",
      "Silk-worm cocoons, reelable",
      "Skins, goat, fresh",
      "Skins, sheep, fresh",
      "Snails, not sea",
      "Whey",
      "Wool, greasy",
      "Yoghurt",
    ];

    //Stage zoom/Animals
    group_6 = svg.selectAll(".node").filter(function (d) {
      return animalZoomNodes.includes(d.name);
    });
    /*
    if (group_3._groups[0].length !== 0 && group_6._groups[0].length == 0) {
      var x_group_3 = group_3._groups[0][0].__data__.x;

      svg
        .append("text")
        .attr("transform", null)
        .attr("y", -10)
        .attr("x", x_group_3 - 25)
        .attr("style", "color: black; font-weight: bold;")
        .text("Animals Stage");
    }*/
    /*
    if (group_6._groups[0].length !== 0) {
      var x_group_6_array = [];

      for (i = 0; i < group_6._groups[0].length; i++) {
        //check if we already save the x coord

        if (!x_group_6_array.includes(group_6._groups[0][i].__data__.x)) {
          x_group_6_array.push(group_6._groups[0][i].__data__.x);
        }
      }


          svg
            .append("text")
            .attr("transform", null)
            .attr("y", -10)
            .attr("x", x_group_6_array.sort()[x_group_6_array.length - 1] - 30) // shift along the x-axis
            .attr("style", "color: black; font-weight: bold;")
            .text("Animals Stage");
    }*/

    //Change place of Animals node
    function manualLayout() {
      for (j = 0; j < nodes.length; j++) {
        pickNode = d3.selectAll(".node")._groups[0][j];
        d = nodes[j];
        if (d.name === "Animals" & d.stage != 1*0.8) {
          d3.select(pickNode).attr(
            "transform",
            "translate(" +
              (d.x = d.x) +
              "," +
              (d.y = Math.max(0, Math.min(height - d.dy))) +
              ")"
          );
        }
      }

      sankey.relayout();
      link.attr("d", path);
    }

    if (options.units == 'kt')
    {
       const circledPlusUnicode = "\u24D8";

    const text = d3.selectAll('.node text')
    .filter(function(d) {return d.name.includes('Net')});

    text.append("tspan")
    .attr("class", "info-circle-trade")
    .style('font-size', options.fontSize*1.2 + 'px')
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
      .on("click",function(d) {Shiny.setInputValue("trade_info", {click:1, node_name:d.name}, {priority: "event"});});
    }

    if (options.region == "World")
    {
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
    if (options.units == 'kt')
    {
          scale_text.textContent =
      "25 px ~  " + "\n" + format(scale_value.toFixed(0)) + " kilotons (" + options.units+") mass" ;

    }
    else if (options.units == 't')
    {
       scale_text.textContent =
      "25 px ~  " + "\n" + format(scale_value.toFixed(0)) + " tons (" + options.units+") protein";
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

    const items_list = [
      "Cereals",
      "Sugar Crops",
      "Fruits",
      "Oilcrops",
      "Starchy Roots",
      "Vegetables",
      "Other",
      "Barley and products",
      "Cereals, Other",
      "Maize and products",
      "Millet and products",
      "Oats",
      "Rice and products",
      "Rye and products",
      "Sorghum and products",
      "Wheat and products",
      "Apples and products",
      "Bananas",
      "Citrus, Other",
      "Dates",
      "Fruits, Other",
      "Grapefruit and products",
      "Grapes and products (excl wine)",
      "Lemons, Limes and products",
      "Oranges, Mandarines",
      "Pineapples and products",
      "Plantains",
      "Coconuts - Incl Copra",
      "Cottonseed",
      "Groundnuts",
      "Oilcrops, Other",
      "Olives (including preserved)",
      "Palm kernels",
      "Rape and Mustardseed",
      "Sesame seed",
      "Soyabeans",
      "Sunflower seed",
      "Beans",
      "Peas",
      "Pulses, Other and products",
      "Cloves",
      "Pepper",
      "Pimento",
      "Spices, Other",
      "Cassava and products",
      "Potatoes and products",
      "Roots, Other",
      "Sweet potatoes",
      "Yams",
      "Cocoa Beans and products",
      "Coffee and products",
      "Tea (including mate)",
      "Nuts and products",
      "Onions",
      "Tomatoes and products",
      "Vegetables, Other",
      "Pulses",
      "Stimulants",
      "Treenuts",
      "Spices",
        "Aquatic Animals, Others",
      "Aquatic Plants",
      "Aquatic Products",
      "Aquatic Products, Other",
      "Bacon and ham",
      "Beeswax",
      "Bovine Meat",
      "Bovine Meat",
      "Butter, Ghee",
      "Cephalopods",
      "Cheese",
      "Cream",
      "Crustaceans",
      "Dairy",
      "Demersal Fish",
      "Eggs",
      "Fat, buffaloes",
      "Fat, camels",
      "Fat, cattle",
      "Fat, goats",
      "Fat, liver prepared (foie gras)",
      "Fat, other animals",
      "Fat, other camelids",
      "Fat, pigs",
      "Fat, poultry",
      "Fat, sheep",
      "Fats",
      "Fish, Seafood",
      "Freshwater Fish",
      "Hides, buffalo, fresh",
      "Hides, cattle, fresh",
      "Honey",
      "Liver prep.",
      "Marine Fish, Other",
      "Materials",
      "Materials",
      "Meat",
      "Meat",
      "Meat nes",
      "Meat nes, preparations",
      "Meat, ass",
      "Meat, beef and veal sausages",
      "Meat, beef, dried, salted, smoked",
      "Meat, beef, preparations",
      "Meat, bird nes",
      "Meat, buffalo",
      "Meat, camel",
      "Meat, cattle",
      "Meat, cattle, boneless (beef & veal)",
      "Meat, chicken",
      "Meat, chicken, canned",
      "Meat, dried nes",
      "Meat, duck",
      "Meat, extracts",
      "Meat, game",
      "Meat, goat",
      "Meat, goose and guinea fowl",
      "Meat, homogenized preparations",
      "Meat, horse",
      "Meat, mule",
      "Meat, Other",
      "Meat, other rodents",
      "Meat, pig",
      "Meat, pig sausages",
      "Meat, pig, preparations",
      "Meat, pork",
      "Meat, rabbit",
      "Meat, sheep",
      "Meat, turkey",
      "Milk",
      "Milk, whole fresh buffalo",
      "Milk, whole fresh camel",
      "Milk, whole fresh cow",
      "Milk, whole fresh goat",
      "Milk, whole fresh sheep",
      "Molluscs, Other",
      "Mutton & Goat Meat",
      "Offals nes",
      "Offals, Edible",
      "Offals, edible, buffaloes",
      "Offals, edible, camels",
      "Offals, edible, cattle",
      "Offals, edible, goats",
      "Offals, horses",
      "Offals, liver chicken",
      "Offals, liver duck",
      "Offals, liver geese",
      "Offals, liver turkeys",
      "Offals, pigs, edible",
      "Offals, sheep,edible",
      "Pelagic Fish",
      "Pigmeat",
      "Poultry Meat",
      "Silk-worm cocoons, reelable",
      "Skins, goat, fresh",
      "Skins, sheep, fresh",
      "Snails, not sea",
      "Whey",
      "Wool, greasy",
      "Yoghurt",
    ];



    if (options.region == "World")
    {
        const temp = d3.selectAll('.node text')
          .filter(function(d) {return items_list.includes(d.name) & d.stage == 0;});

            temp.append("tspan")
    .attr("class", "info-top-producers")
    .style('font-size', options.fontSize*1.2 + 'px')
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
      .on("click",function(d) {Shiny.setInputValue("top_producers", {click:1, node_name:d.name}, {priority: "event"});});

    var x_coord = nodes.map(function(d) {
        return d.x;});


    x_coord = [...new Set(x_coord)].sort();

    for (i = 0; i < x_coord.length; i++)
    {

     console.log(stage_names);
      console.log(stage_names[i]['name'])

      if (i == 0)
      {

            svg
            .append("text")
            .attr("transform", null)
            .attr("y", -10)
            .attr("text-anchor", "start")
            .attr("x", x_coord[i]) // shift along the x-axis
            .attr("style", "color: black; font-weight: bold; font-size: 14px;")
            .text(stage_names[i]['name']);
      }
      else{
                     svg
            .append("text")
            .attr("transform", null)
            .attr("y", -10)
            .attr("text-anchor", "middle")
            .attr("x", x_coord[i] + options.nodeWidth/2) // shift along the x-axis
            .attr("style", "color: black; font-weight: bold; font-size: 14px;")
            .text(stage_names[i]['name']);
      }

    }

  },
});
