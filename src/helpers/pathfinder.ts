// A* Pathfinding with Manhattan Heuristics for Hexagons.
// reference: https://github.com/nreijmersdal/hexpath
import { Land, MapInfo, Point } from "../interfaces";

export class PathFinder {
    private mapSizeX:number;
    private mapSizeY:number;
    private mapArray:MapInfo;
    private firstrowlong:boolean = false;
    private restricted: { [key in Land]:boolean};

    constructor(sizeX:number, sizeY:number, map:MapInfo, restricted:{ [key in Land]:boolean}) {
        this.mapSizeX = sizeX;
        this.mapSizeY = sizeY;
        this.mapArray = map;
        this.restricted = restricted;
    }

    public find(start_x:number, start_y:number, end_x:number, end_y:number):Point[] {
        var newPath:Point[] = [];
        // Check cases path is impossible from the start.
        var error = 0;
        if (start_x == end_x && start_y == end_y)
            error = 1;
        if (!this.hex_accessible(start_x, start_y))
            error = 1;
        if (!this.hex_accessible(end_x, end_y))
            error = 1;
        if (error == 1) {
            console.log('Path is impossible to create: ' + start_x + ', ' + start_y + ' to ' + end_x + ', ' + end_y);
            return newPath;
        }
    
        // Init
        var openlist = new Array(this.mapSizeX * this.mapSizeY + 2);
        var openlist_x = new Array(this.mapSizeX);
        var openlist_y = new Array(this.mapSizeY);
        var statelist = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
        // current open or closed state
        var openlist_g = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
        var openlist_f = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
        var openlist_h = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
        var parent_x = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
        var parent_y = this.multiDimensionalArray(this.mapSizeX + 1, this.mapSizeY + 1);
        var path = this.multiDimensionalArray(this.mapSizeX * this.mapSizeY + 2, 2);
    
        var select_x = 0;
        var select_y = 0;
        var node_x = 0;
        var node_y = 0;
        var counter = 1;
        // Openlist_ID counter
        var selected_id:any = 0;
        // Actual Openlist ID
    
        // Add start coordinates to openlist.
        openlist[1] = true;
        openlist_x[1] = start_x;
        openlist_y[1] = start_y;
        openlist_f[start_x][start_y] = 0;
        openlist_h[start_x][start_y] = 0;
        openlist_g[start_x][start_y] = 0;
        statelist[start_x][start_y] = true;
    
        // Try to find the path until the target coordinate is found
        while (statelist[end_x][end_y] != true) {
            let set_first = true;
            let lowest_x:any;
            let lowest_y:any;
            // Find lowest F in openlist
            for (var i in openlist) {
                if (openlist[i] == true) {
                    select_x = openlist_x[i];
                    select_y = openlist_y[i];
                    let lowest_found:any;
                    if (set_first == true) {
                        lowest_found = openlist_f[select_x][select_y];
                        set_first = false;
                    }
                    if (openlist_f[select_x][select_y] <= lowest_found) {
                        lowest_found = openlist_f[select_x][select_y];
                        lowest_x = openlist_x[i];
                        lowest_y = openlist_y[i];
                        selected_id = i;
                    }
                }
            }
            if (set_first == true) {
                // open_list is empty
                //alert('No possible route can be found: ' + start_x + ', ' + start_y + ' to ' + end_x + ', ' + end_y);
                return newPath;
            }
            // add it lowest F as closed to the statelist and remove from openlist
            statelist[lowest_x][lowest_y] = 2;
            openlist[selected_id] = false;
            // Add connected nodes to the openlist
            for (let i = 1; i < 7; i++) {
                // Run node update for 6 neighbouring tiles.
                // Neighboring tiles are affected by tile alignment (depends on 'firstrowlong')
                switch(i) {
                    case 1:
                        node_x = parseInt(lowest_x) + 1;
                        if (this.firstrowlong) {
                            if (this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y);
                            } else {
                                node_y = parseInt(lowest_y) - 1;
                            }
                        } else {
                            if (!this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y);
                            } else {
                                node_y = parseInt(lowest_y) - 1;
                            }
                        }
                        break;
                    case 2:
                        node_x = parseInt(lowest_x);
                        node_y = parseInt(lowest_y) - 1;
                        break;
                    case 3:
                        node_x = parseInt(lowest_x) - 1;
                        if (this.firstrowlong) {
                            if (this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y);
                            } else {
                                node_y = parseInt(lowest_y) - 1;
                            }
                        } else {
                            if (!this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y);
                            } else {
                                node_y = parseInt(lowest_y) - 1;
                            }
                        }
                        break;
                    case 4:
                        node_x = parseInt(lowest_x) - 1;
                        if (this.firstrowlong) {
                            if (this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y) + 1;
                            } else {
                                node_y = parseInt(lowest_y);
                            }
                        } else {
                            if (!this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y) + 1;
                            } else {
                                node_y = parseInt(lowest_y);
                            }
                        }
                        break;
                    case 5:
                        node_x = parseInt(lowest_x);
                        node_y = parseInt(lowest_y) + 1;
                        break;
                    case 6:
                        node_x = parseInt(lowest_x) + 1;
                        if (this.firstrowlong) {
                            if (this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y) + 1;
                            } else {
                                node_y = parseInt(lowest_y);
                            }
                        } else {
                            if (!this.isodd(lowest_x)) {
                                node_y = parseInt(lowest_y) + 1;
                            } else {
                                node_y = parseInt(lowest_y);
                            }
                        }
                        break;
                }
                if (this.hex_accessible(node_x, node_y)) {
                    if (statelist[node_x][node_y] == true) {
                        if (openlist_g[node_x][node_y] < openlist_g[lowest_x][lowest_y]) {
                            parent_x[lowest_x][lowest_y] = node_x;
                            parent_y[lowest_x][lowest_y] = node_y;
                            openlist_g[lowest_x][lowest_y] = openlist_g[node_x][node_y] + 10;
                            openlist_f[lowest_x][lowest_y] = openlist_g[lowest_x][lowest_y] + openlist_h[lowest_x][lowest_y];
                        }
                    } else if (statelist[node_x][node_y] == 2) {
                        // its on closed list do nothing.
                    } else {
                        counter++;
                        // add to open list
                        openlist[counter] = true;
                        openlist_x[counter] = node_x;
                        openlist_y[counter] = node_y;
                        statelist[node_x][node_y] = true;
                        // Set parent
                        parent_x[node_x][node_y] = lowest_x;
                        parent_y[node_x][node_y] = lowest_y;
                        // update H , G and F
                        var ydist = end_y - node_y;
                        if (ydist < 0)
                            ydist = ydist * -1;
                        var xdist = end_x - node_x;
                        if (xdist < 0)
                            xdist = xdist * -1;
                        openlist_h[node_x][node_y] = this.hex_distance(node_x, node_y, end_x, end_y) * 10;
                        openlist_g[node_x][node_y] = openlist_g[lowest_x][lowest_y] + 10;
                        openlist_f[node_x][node_y] = openlist_g[node_x][node_y] + openlist_h[node_x][node_y];
                    }
                }
            }
        }
    
        // Get Path
        let temp_x = end_x;
        let temp_y = end_y;
        counter = 0;
        while (temp_x != start_x || temp_y != start_y) {
            counter++;
            path[counter][1] = temp_x;
            path[counter][2] = temp_y;
            temp_x = parent_x[path[counter][1]][path[counter][2]];
            temp_y = parent_y[path[counter][1]][path[counter][2]];
        }
        counter++;
        path[counter][1] = start_x;
        path[counter][2] = start_y;
        // Draw path.
        while (counter != 0) {
            newPath.push({x: path[counter][1], y: path[counter][2]});
            counter--;
        }
        return newPath;
    }

    // check if hex is accessible
    private hex_accessible(x:number, y:number):boolean {
        if (this.mapArray[x] === undefined) {
            return false;
        }
        if (this.mapArray[x][y] === undefined) {
            return false;
        }
        if (this.restricted[this.mapArray[x][y]['type']] == false) {
            return false;
        }
        return true;
    }

    // create a multi-dimensional array
    private multiDimensionalArray(nRows:number, nCols:number):any {
        let a = new Array(nRows);
        for (let i = 0; i < nRows; i++) {
            a[i] = new Array(nCols);
            for (let  j = 0; j < nCols; j++) {
                a[i][j] = "";
            }
        }
        return (a);
    }

    // check whether a given number is odd or even
	private isodd(n:number):number {
		return n % 2;
		// n%2 returns 0 if n is even, 1 id n is odd
	}

    // calculate distance between two hexes
	private hex_distance(x1:number, y1:number, x2:number, y2:number):number {
		let dx = Math.abs(x1 - x2);
		let dy = Math.abs(y2 - y1);
		return Math.sqrt((dx * dx) + (dy * dy));
	}
}