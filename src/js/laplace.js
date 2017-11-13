// Plannar Laplace mechanism, based on Marco's demo
//
// This class just implements the mechanism, does no budget management or
// selection of epsilon
//


// constructor
function PlannarLaplace() {
}


PlannarLaplace.earth_radius = 6378137; //const, in meters

// convert an angle in radians to degrees and viceversa
PlannarLaplace.prototype.rad_of_deg = function(ang){return ang * Math.PI / 180};;
PlannarLaplace.prototype.deg_of_rad = function(ang){return ang * 180 / Math.PI};;

// Mercator projection 
// https://wiki.openstreetmap.org/wiki/Mercator
// https://en.wikipedia.org/wiki/Mercator_projection

//getLatLon and getCartesianPosition are inverse functions
//They are used to transfer { x: ..., y: ... } and { latitude: ..., longitude: ... } into one another
PlannarLaplace.prototype.getLatLon = function(cart) {
	var rLon = cart.x / PlannarLaplace.earth_radius;
	var rLat = 2 * (Math.atan(Math.exp(cart.y / PlannarLaplace.earth_radius))) - Math.PI/2;
	//convert to degrees
	return {
		latitude: this.deg_of_rad(rLat),
		longitude: this.deg_of_rad(rLon)
	};
}

PlannarLaplace.prototype.getCartesian = function(ll){
	// latitude and longitude are converted in radiants
	return {
		x: PlannarLaplace.earth_radius * this.rad_of_deg(ll.longitude),
		y: PlannarLaplace.earth_radius * Math.log( Math.tan(Math.PI / 4 + this.rad_of_deg(ll.latitude) / 2))
	};
}


// LamberW function on branch -1 (http://en.wikipedia.org/wiki/Lambert_W_function)
PlannarLaplace.prototype.LambertW = function(x){
	//min_diff decides when the while loop should stop
	var min_diff = 1e-10;
	if (x == -1/Math.E){
		return -1;
	}

	else if (x<0 && x>-1/Math.E) {
		var q = Math.log(-x);
		var p = 1;
		while (Math.abs(p-q) > min_diff) {
			p=(q*q+x/Math.exp(q))/(q+1);
			q=(p*p+x/Math.exp(p))/(p+1);
		}
		//This line decides the precision of the float number that would be returned
		return (Math.round(1000000*q)/1000000);
	}
	else if (x==0) {return 0;}
	//TODO why do you need this if branch? 
	else{
		return 0;
	}
}

// This is the inverse cumulative polar laplacian distribution function. 
PlannarLaplace.prototype.inverseCumulativeGamma = function(epsilon, z){
	var x = (z-1) / Math.E;
	return - (this.LambertW(x) + 1) / epsilon;
}

// returns alpha such that the noisy pos is within alpha from the real pos with
// probability at least delta
// (comes directly from the inverse cumulative of the gamma distribution)
//
PlannarLaplace.prototype.alphaDeltaAccuracy = function(epsilon, delta) {
	return this.inverseCumulativeGamma(epsilon, delta);
}

// returns the average distance between the real and the noisy pos
//
PlannarLaplace.prototype.expectedError = function(epsilon) {
	return 2 / epsilon;
}


PlannarLaplace.prototype.addPolarNoise = function(epsilon, pos) {
	//random number in [0, 2*PI)
	var theta = Math.random() * Math.PI * 2;
	//random variable in [0,1)
	var z = Math.random();
	var r = this.inverseCumulativeGamma(epsilon, z);

	return this.addVectorToPos(pos, r, theta);
}

PlannarLaplace.prototype.addPolarNoiseCartesian = function(epsilon, pos) {
	if('latitude' in pos)
		pos = this.getCartesian(pos);

	//random number in [0, 2*PI)
	var theta = Math.random() * Math.PI * 2;
	//random variable in [0,1)
	var z = Math.random();
	var r = this.inverseCumulativeGamma(epsilon, z);

	return this.getLatLon({
		x: pos.x + r * Math.cos(theta),
		y: pos.y + r * Math.sin(theta)
	});
}

// http://www.movable-type.co.uk/scripts/latlong.html
PlannarLaplace.prototype.addVectorToPos = function(pos, distance, angle) {
	var ang_distance = distance / PlannarLaplace.earth_radius;
	var lat1 = this.rad_of_deg(pos.latitude);
	var lon1 = this.rad_of_deg(pos.longitude);

	var	lat2 =	Math.asin(
					Math.sin(lat1) * Math.cos(ang_distance) + 
					Math.cos(lat1) * Math.sin(ang_distance) * Math.cos(angle)
			  	);
	var lon2 =	lon1 +
			   	Math.atan2(
					Math.sin(angle) * Math.sin(ang_distance) * Math.cos(lat1), 
					Math.cos(ang_distance) - Math.sin(lat1) * Math.sin(lat2)
				);
	lon2 = (lon2 + 3 * Math.PI) % (2 * Math.PI) - Math.PI;		// normalise to -180..+180
	return { 
		latitude: this.deg_of_rad(lat2),
		longitude: this.deg_of_rad(lon2)
	};
}


//This function generates the position of a point with Laplacian noise
//
PlannarLaplace.prototype.addNoise = function(epsilon, pos) {
	// TODO: use latlon.js
	return this.addPolarNoise(epsilon, pos);
}

